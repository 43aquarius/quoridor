# 性能预算

## 帧率目标

稳定 60 fps，主循环用 `requestAnimationFrame`，每帧逻辑控制在 16ms 以内。通过 `KwaiRender.setPreferredFramesPerSecond(60)` 提示容器目标帧率。

时间差统一用 `AIGCUtils._now()` 计算，禁止 `performance.now()`（快手环境报错）。

## 包体限制

具体数值见 [subpackage-rules.md](subpackage-rules.md#体积限制)（主包/子包/总体积限制统一在该文档维护，此处不重复）。视频资源由 yoola 平台在上传阶段统一上传 CDN 并替换引用地址，开发阶段仅在 `res/Video/` 下保留本地文件用于预览调试，无需手动调用上传接口。

## 内存建议

JS 堆建议上限 128 MiB。超出会触发 `onMemoryWarning`（通过 `KwaiDevice.onMemoryWarning` 监听），此时应立即释放当前场景资源：

```js
KwaiDevice.onMemoryWarning(function (res) {
  console.warn('Memory.Warning', '内存告警 level=' + res.level);
  // 立即销毁/释放当前场景持有的图片、音频、视频资源引用
});
```

## 纹理规格

- 纹理尺寸建议为 2 的幂次（如 256、512、1024），非 POT 纹理会导致部分设备性能下降
- 单张纹理建议不超过 2048×2048，4096×4096 在低端设备可能 OOM
- 使用完毕的纹理及时销毁 / 释放引用，避免 VRAM 泄漏

## 资源大小建议

各资源类型的单文件上限与主包/CDN 存放决策，见 [resource-spec.md](resource-spec.md#资源存放决策总表)（唯一维护处，此处不重复）。

## 启动耗时目标

首帧可见时间 < 3 秒（依赖首页渲染图在主包内）。广告初始化在首帧可见后异步完成，不阻塞渲染。

## 性能自检清单

```
[] requestAnimationFrame 驱动主循环，无 setInterval 计时
[] 每帧无多余 DOM 查询（快手环境 DOM 访问代价高）
[] 离开场景时已销毁/释放不再使用的图片、音频、视频资源
[] 监听了 KwaiDevice.onMemoryWarning，告警时主动释放资源
[] 视频文件未打入包体，仅在 res/Video/ 保留本地调试文件
[] 非首屏资源已放入分包，首屏必需资源留在主包（CDN 化由平台统一处理）
[] 纹理尺寸为 2 的幂次，单张不超过 2048×2048
```
