GameGlobal.wx = ks
ks.onMessage = function() {}
ks.getOpenDataContext = function() {}
GameGlobal.window = GameGlobal
ks.getPerformance = function() {
    return {
        now: function() {
            return new Date().getTime()
        }
    }
}
