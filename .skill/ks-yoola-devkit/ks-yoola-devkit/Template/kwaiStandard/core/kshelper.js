/******************************************************************************
 *
 * KS Mini Game Adapter
 *
******************************************************************************/
let KS_GAME_ENV = typeof ks !== 'undefined';
let SystemInfo = null;
let MainCanvas = null;

let TRY_USE_GAME_MODE = true;
let CAN_USE_GAME_MODE = false;
const FRAME_RATE = 60;
const FRAME_TIME = 1000.0 / FRAME_RATE;

if (KS_GAME_ENV) {
  SystemInfo = ks.getSystemInfoSync();

  console.log("Game run in ks mini game env "
    + ", window:" + SystemInfo.windowWidth + "x" + SystemInfo.windowHeight
    + ", pixelRatio:" + SystemInfo.pixelRatio
    + ", screen:" + SystemInfo.screenWidth + "x" + SystemInfo.screenHeight
    + ", window " + typeof window + ", GameGlobal " + typeof GameGlobal);
} else {
  console.log("Game run in browser env, window:"
    + window.outerWidth + "x" + window.outerHeight
    + ", dpr:" + window.devicePixelRatio
    + ", screen:" + window.screen.width + "x" + window.screen.height);
}

function IsKsGameEnv() { return KS_GAME_ENV; }
function TryUseGameMode() { return TRY_USE_GAME_MODE; }
function CanUseGameMode() { return CAN_USE_GAME_MODE; }
function DetectCanUseGameMode(gl) {
  if (TryUseGameMode() && gl && gl.getContextAttributes().gameMode)
    CAN_USE_GAME_MODE = true;
}

// Fxxk, ks performance.now return microsecond in device,
// return millisecond in devtools, we return millisecond in here!
function Now() {
  if (KS_GAME_ENV) {
    return ks.getPerformance().now();
  } else {
    return performance.now();
  }
}

function CreateImage() {
  if (KS_GAME_ENV) {
    return ks.createImage();
  } else {
    return new Image();
  }
}

function GetMainCanvas(domId) {
  function GetMainCanvasImpl(domId) {
    if (KS_GAME_ENV) {
      if (window != null && window.canvas != null)
        return window.canvas;
      else
        return ks.createCanvas();
    } else {
      return document.getElementById(domId);
    }
  }

  if (MainCanvas != null)
    return MainCanvas;

  MainCanvas = GetMainCanvasImpl(domId);
  return MainCanvas;
}

function GetWindowSize() {
  let windowWidth = 0;
  let windowHeight = 0;
  if (KS_GAME_ENV) {
    windowWidth = SystemInfo.windowWidth;
    windowHeight = SystemInfo.windowHeight;
  } else {
    windowWidth = window.outerWidth;
    windowHeight = window.outerHeight;
  }
  return {"width":windowWidth, "height":windowHeight}
}

function GetWindowSizeInPx() {
  let windowWidth = 0;
  let windowHeight = 0;
  let dpr = 0;

  if (KS_GAME_ENV) {
    windowWidth = SystemInfo.windowWidth;
    windowHeight = SystemInfo.windowHeight;
    dpr = SystemInfo.pixelRatio;
  } else {
    windowWidth = window.outerWidth;
    windowHeight = window.outerHeight;
    dpr = window.devicePixelRatio;
  }

  let windowWidthPx = windowWidth * dpr;
  let windowHeightPx = windowHeight * dpr;

  if (Math.abs(windowWidthPx - 1080) < dpr) {
    windowWidthPx = 1080;
  } else if (Math.abs(windowWidthPx - 1440) < dpr) {
    windowWidthPx = 1440;
  }

  if (Math.abs(windowHeightPx - 1920) < dpr) {
    windowHeightPx = 1920;
  } else if (Math.abs(windowHeightPx - 2560) < dpr) {
    windowHeightPx = 2560;
  }

  return {"width":windowWidthPx, "height":windowHeightPx}
}

function GetCanvasSizeUseWindowRatio(width) {
  let windowSize = GetWindowSizeInPx();
  let height = Math.round(width * windowSize.height / windowSize.width);
  return {"width":width, "height":height}
}

function SubmitGLFrame(gl) {
  if (CanUseGameMode() && gl && gl.submit) gl.submit();
}

let TimeUtil = {
  startTime: Now(),
  getTimer: function() { return Now() - TimeUtil.startTime; },
}

let GameLoopUtil = {
  lastTime: Now(),

  requestNextFrame: function(callback) {
    if (CanUseGameMode()) {
      let currTime = Now();
      let timeToCall = Math.max(0.5, FRAME_TIME - (currTime - GameLoopUtil.lastTime));
      let id = setTimeout(function() {
        GameLoopUtil.lastTime = Now();
        callback();
      }, timeToCall);
      GameLoopUtil.lastTime = currTime + timeToCall;
      return id;
    } else {
      return requestAnimationFrame(callback);
    }
  },

  cancalNextFrame: function(id) {
    if (CanUseGameMode()) {
      clearTimeout(id);
    } else {
      cancelAnimationFrame(id);
    }
  }
}

function FPSMeter() {
  let lastSampledTime = 0;
  let sampleFrames = 0;
  let framerate = 0;

  this.formatNumber = function (val) {
    //format as XX.XX
    return Math.floor(val*100)/100;
  }

  this.update = function() {
    if (++sampleFrames >= 600) {
      framerate = this.getFramerate();
      let frames = sampleFrames;
      sampleFrames = 0;
      return {"framerate": framerate, "frames": frames};
    }
    return {"framerate": 0};
  }

  this.getFramerate = function() {
    let diff = TimeUtil.getTimer() - lastSampledTime;
    let rawFPS = sampleFrames/(diff/1000);
    let sampleFPS = this.formatNumber(rawFPS);
    lastSampledTime = TimeUtil.getTimer();
    return sampleFPS;
  }
}

let kshelper = {
  IsKsGameEnv,
  TryUseGameMode,
  CanUseGameMode,
  DetectCanUseGameMode,
  Now,
  CreateImage,
  GetMainCanvas,
  GetWindowSize,
  GetWindowSizeInPx,
  GetCanvasSizeUseWindowRatio,
  SubmitGLFrame,
  TimeUtil,
  GameLoopUtil,
  FPSMeter,
};

if (typeof window !== 'undefined') {
  window.kshelper = kshelper;
} else if (typeof GameGlobal !== 'undefined') {
  GameGlobal.kshelper = kshelper;
  GameGlobal.window = GameGlobal;
  window.top = GameGlobal.parent = window;
} else {
  console.log("Cannot find any global object!");
}
