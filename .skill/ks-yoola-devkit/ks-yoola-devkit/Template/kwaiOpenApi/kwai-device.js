/**
 * kwai-device.js — 快手端设备能力模块（支持 Web 降级）
 *
 * 快手环境：使用 ks.* API
 * Web 降级策略：
 *   - 振动：navigator.vibrate()（Chrome / Android）
 *   - 内存告警：无 Web 等价，静默忽略
 *   - 加速度计：DeviceMotionEvent（需 HTTPS）
 *   - 陀螺仪：DeviceOrientationEvent（需 HTTPS）
 *   - 设备方向（DeviceMotion）：DeviceOrientationEvent absolute
 *   - 键盘：无可靠等价，静默降级（浏览器自带输入框）
 *
 * 使用方式：
 *   KwaiDevice.vibrateShort('medium');
 *   KwaiDevice.startAccelerometer({ interval: 'game' });
 *   KwaiDevice.onAccelerometerChange(function(res) { console.log(res.x, res.y, res.z); });
 *   KwaiDevice.stopAccelerometer();
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── 振动 ───────────────────────────────────────────────────

  function vibrateShort(type) {
    if (_isKwai) {
      ks.vibrateShort({ type: type || 'medium' });
    } else if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }

  function vibrateLong() {
    if (_isKwai) {
      ks.vibrateLong({});
    } else if (navigator.vibrate) {
      navigator.vibrate(400);
    }
  }

  // ─── 内存告警（仅快手） ─────────────────────────────────────

  function onMemoryWarning(callback) {
    if (_isKwai) {
      ks.onMemoryWarning(callback);
    }
    // Web 无等价，静默
  }

  // ─── 加速度计 ───────────────────────────────────────────────

  var _accelCallback = null;

  function startAccelerometer(options) {
    options = options || {};
    if (_isKwai) {
      ks.startAccelerometer({ interval: options.interval || 'normal' });
      return;
    }
    // Web 降级：DeviceMotionEvent
    if (typeof DeviceMotionEvent !== 'undefined') {
      _accelCallback = function (e) {
        var a = e.accelerationIncludingGravity || e.acceleration || {};
        if (typeof _accelChangeCallback === 'function') {
          _accelChangeCallback({ x: a.x || 0, y: a.y || 0, z: a.z || 0 });
        }
      };
      window.addEventListener('devicemotion', _accelCallback);
    }
  }

  function stopAccelerometer() {
    if (_isKwai) {
      ks.stopAccelerometer({});
      return;
    }
    if (_accelCallback) {
      window.removeEventListener('devicemotion', _accelCallback);
      _accelCallback = null;
    }
  }

  var _accelChangeCallback = null;

  function onAccelerometerChange(callback) {
    if (_isKwai) {
      ks.onAccelerometerChange(callback);
      return;
    }
    _accelChangeCallback = callback;
  }

  function offAccelerometerChange(callback) {
    if (_isKwai) {
      ks.offAccelerometerChange(callback);
      return;
    }
    _accelChangeCallback = null;
  }

  // ─── 陀螺仪 ─────────────────────────────────────────────────

  var _gyroCallback = null;
  var _gyroChangeCallback = null;

  function startGyroscope(options) {
    options = options || {};
    if (_isKwai) {
      ks.startGyroscope({ interval: options.interval || 'normal' });
      return;
    }
    if (typeof DeviceOrientationEvent !== 'undefined') {
      _gyroCallback = function (e) {
        if (typeof _gyroChangeCallback === 'function') {
          _gyroChangeCallback({ x: e.beta || 0, y: e.gamma || 0, z: e.alpha || 0 });
        }
      };
      window.addEventListener('deviceorientation', _gyroCallback);
    }
  }

  function stopGyroscope() {
    if (_isKwai) {
      ks.stopGyroscope({});
      return;
    }
    if (_gyroCallback) {
      window.removeEventListener('deviceorientation', _gyroCallback);
      _gyroCallback = null;
    }
  }

  function onGyroscopeChange(callback) {
    if (_isKwai) {
      ks.onGyroscopeChange(callback);
      return;
    }
    _gyroChangeCallback = callback;
  }

  function offGyroscopeChange(callback) {
    if (_isKwai) {
      ks.offGyroscopeChange(callback);
      return;
    }
    _gyroChangeCallback = null;
  }

  // ─── 设备方向 ────────────────────────────────────────────────

  var _motionCallback = null;
  var _motionChangeCallback = null;

  function startDeviceMotion(options) {
    options = options || {};
    if (_isKwai) {
      ks.startDeviceMotionListening({ interval: options.interval || 'normal' });
      return;
    }
    if (typeof DeviceOrientationEvent !== 'undefined') {
      _motionCallback = function (e) {
        if (typeof _motionChangeCallback === 'function') {
          _motionChangeCallback({ alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 });
        }
      };
      window.addEventListener('deviceorientationabsolute', _motionCallback);
    }
  }

  function stopDeviceMotion() {
    if (_isKwai) {
      ks.stopDeviceMotionListening({});
      return;
    }
    if (_motionCallback) {
      window.removeEventListener('deviceorientationabsolute', _motionCallback);
      _motionCallback = null;
    }
  }

  function onDeviceMotionChange(callback) {
    if (_isKwai) {
      ks.onDeviceMotionChange(callback);
      return;
    }
    _motionChangeCallback = callback;
  }

  function offDeviceMotionChange(callback) {
    if (_isKwai) {
      ks.offDeviceMotionChange(callback);
      return;
    }
    _motionChangeCallback = null;
  }

  // ─── 键盘（仅快手，Web 使用原生 input） ──────────────────────

  function showKeyboard(options) {
    options = options || {};
    if (_isKwai) {
      ks.showKeyboard({
        defaultValue: options.defaultValue || '',
        maxLength:    options.maxLength    || 140,
        multiple:     options.multiple     || false,
        confirmHold:  options.confirmHold  || false,
        confirmType:  options.confirmType  || 'done',
      });
    }
    // Web 环境由玩法代码自行创建 <input> 或 <textarea>，此处静默
  }

  function hideKeyboard() {
    if (_isKwai) {
      ks.hideKeyboard({});
    }
    // Web 环境由玩法代码自行管理 focus / blur
  }

  function onKeyboardInput(callback) {
    if (_isKwai) ks.onKeyboardInput(callback);
  }

  function onKeyboardConfirm(callback) {
    if (_isKwai) ks.onKeyboardConfirm(callback);
  }

  function onKeyboardComplete(callback) {
    if (_isKwai) ks.onKeyboardComplete(callback);
  }

  window.KwaiDevice = {
    vibrateShort:            vibrateShort,
    vibrateLong:             vibrateLong,
    onMemoryWarning:         onMemoryWarning,
    startAccelerometer:      startAccelerometer,
    stopAccelerometer:       stopAccelerometer,
    onAccelerometerChange:   onAccelerometerChange,
    offAccelerometerChange:  offAccelerometerChange,
    startGyroscope:          startGyroscope,
    stopGyroscope:           stopGyroscope,
    onGyroscopeChange:       onGyroscopeChange,
    offGyroscopeChange:      offGyroscopeChange,
    startDeviceMotion:       startDeviceMotion,
    stopDeviceMotion:        stopDeviceMotion,
    onDeviceMotionChange:    onDeviceMotionChange,
    offDeviceMotionChange:   offDeviceMotionChange,
    showKeyboard:            showKeyboard,
    hideKeyboard:            hideKeyboard,
    onKeyboardInput:         onKeyboardInput,
    onKeyboardConfirm:       onKeyboardConfirm,
    onKeyboardComplete:      onKeyboardComplete,
  };

})();
