(function() {
  window.KwaiEvent = {
    _handlers: {},
    on: function(event, fn) {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(fn);
    },
    emit: function(event, data) {
      var handlers = this._handlers[event] || [];
      for (var i = 0; i < handlers.length; i++) handlers[i](data);
    },
    off: function(event, fn) {
      if (!this._handlers[event]) return;
      this._handlers[event] = this._handlers[event].filter(function(h) { return h !== fn; });
    },
    once: function(event, fn) {
      var self = this;
      function wrapper(data) {
        fn(data);
        self.off(event, wrapper);
      }
      this.on(event, wrapper);
    },
  };
})();
