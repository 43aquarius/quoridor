/** 包内路径解析、持久化下载和图片内存管理。 */
(function () {
  var utils = window.AIGCUtils = window.AIGCUtils || {};
  var kwai = typeof ks !== 'undefined';
  var pending = Object.create(null), entries = Object.create(null), warmed = Object.create(null);
  var created = 0, destroyed = 0;

  function filePath(url) {
    var hash = 2166136261;
    for (var i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 16777619);
    var name = url.split(/[?#]/)[0].split('/').pop();
    var ext = /\.([a-z0-9]+)$/i.exec(name);
    return ks.env.USER_DATA_PATH + '/resource-' + (hash >>> 0).toString(16) + (ext ? '.' + ext[1].toLowerCase() : '');
  }

  function download(url) {
    if (!kwai) return Promise.resolve(url);
    if (pending[url]) return pending[url];
    var fs = ks.getFileSystemManager && ks.getFileSystemManager();
    if (!fs || !ks.env || !ks.env.USER_DATA_PATH || typeof KwaiNetwork === 'undefined' || !KwaiNetwork.downloadFile) {
      return Promise.reject(new Error('持久化资源下载不可用'));
    }
    var dest = filePath(url);
    pending[url] = new Promise(function (resolve, reject) {
      function fetchFile() {
        KwaiNetwork.downloadFile({ url: url, filePath: dest, onSuccess: function (res) {
          if (res.statusCode && res.statusCode !== 200) { reject(new Error('资源下载失败: HTTP ' + res.statusCode)); return; }
          resolve(res.filePath || dest);
        }, onFail: reject });
      }
      fs.access({ path: dest, success: function () { resolve(dest); }, fail: fetchFile });
    }).then(function (path) { delete pending[url]; return path; }, function (err) { delete pending[url]; throw err; });
    return pending[url];
  }

  function pathFor(src) {
    if (typeof src !== 'string' || !src || /^https?:\/\//i.test(src)) return Promise.resolve(src);
    var url = (window.AIGCResourceManifest || {})[src.replace(/^\.\//, '')];
    return url ? download(url) : Promise.resolve(src);
  }

  // 兼容原有回调式接口；包内原路径可在下载失败时作为回退。
  function resolve(src, callback) {
    callback = callback || function () {};
    if (typeof src !== 'string' || !(window.AIGCResourceManifest || {})[src.replace(/^\.\//, '')]) {
      callback(src);
      return Promise.resolve(src);
    }
    return pathFor(src).then(function (path) { callback(path); return path; }, function (err) {
      console.warn('[ResourceLoader] 下载失败', src, err);
      callback(src);
      return src;
    });
  }

  function predownload(items, opts) {
    items = items || []; opts = opts || {};
    var done = 0;
    return Promise.all(items.map(function (item) {
      return pathFor(item.path || item.src).then(function () {
        if (item.key) warmed[item.key] = true;
        if (opts.onProgress) opts.onProgress(++done, items.length);
      });
    })).then(function () { if (opts.onSuccess) opts.onSuccess(); }, function (err) {
      if (opts.onFail) opts.onFail(err);
      throw err;
    });
  }

  function destroy(entry) {
    if (!entry) return;
    delete entries[entry.key];
    entry.resource.onload = null;
    entry.resource.onerror = null;
    try { entry.resource.src = ''; } catch (e) {}
    entry.reject(new Error('资源已释放: ' + entry.key));
    destroyed++;
  }

  function acquire(type, key, src, group) {
    if (type !== 'image') return null;
    var entry = entries[key];
    if (entry && (entry.src !== src || entry.type !== type)) throw new Error('资源 key 冲突: ' + key);
    if (!entry) {
      var img = kwai ? ks.createImage() : new Image();
      entry = { key: key, type: type, src: src, resource: img, refCount: 0, groups: Object.create(null), loaded: false };
      entry.promise = new Promise(function (ok, fail) { entry.accept = ok; entry.reject = fail; });
      entry.promise.catch(function () {});
      entries[key] = entry;
      created++;
      img.onload = function () { entry.loaded = true; entry.accept(img); };
      img.onerror = function (err) { entry.reject(err || new Error('图片加载失败: ' + src)); };
      pathFor(src).then(function (path) { if (entries[key] === entry) img.src = path; }, function (err) {
        if (entries[key] === entry) entry.reject(err);
      });
    }
    entry.refCount++;
    if (group) entry.groups[group] = (entry.groups[group] || 0) + 1;
    var released = false;
    return { resource: entry.resource, release: function () {
      if (!released) { released = true; if (entries[key] === entry) release(key, group); }
    } };
  }

  function release(key, group) {
    var entry = entries[key];
    if (!entry) return;
    if (group && entry.groups[group]) {
      if (--entry.groups[group] === 0) delete entry.groups[group];
    } else if (!group) {
      var groups = Object.keys(entry.groups);
      if (groups.length && --entry.groups[groups[0]] === 0) delete entry.groups[groups[0]];
    }
    entry.refCount--;
    if (entry.refCount <= 0) destroy(entry);
  }

  function releaseGroup(group) {
    Object.keys(entries).forEach(function (key) {
      var count = entries[key].groups[group] || 0;
      while (count--) release(key, group);
    });
  }

  var loader = {
    resolve: resolve,
    download: pathFor,
    predownload: predownload,
    preload: predownload, // 兼容原有批量预下载接口
    isCached: function (key) { return !!warmed[key]; },
    acquire: acquire,
    release: release,
    releaseGroup: releaseGroup,
    get: function (key) { return entries[key] ? entries[key].resource : null; },
    loaded: function (key) { return !!(entries[key] && entries[key].loaded); },
    ready: function (key) { return entries[key] ? entries[key].promise : Promise.resolve(null); },
    getState: function (key) { var e = entries[key]; return e ? { type: e.type, src: e.src, loaded: e.loaded, refCount: e.refCount, groups: Object.keys(e.groups) } : null; },
    stats: function () { var keys = Object.keys(entries); return { total: keys.length, loaded: keys.filter(function (key) { return entries[key].loaded; }).length, totalRefs: keys.reduce(function (n, key) { return n + entries[key].refCount; }, 0), byType: { image: keys.length }, keys: keys, created: created, destroyed: destroyed }; },
    logStats: function () { console.log('[ResourceLoader]', this.stats()); },
    destroyAll: function () { Object.keys(entries).forEach(function (key) { destroy(entries[key]); }); }
  };
  utils.ResourceLoader = loader;
})();
