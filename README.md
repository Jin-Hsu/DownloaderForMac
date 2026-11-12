# DownloaderForMac

一个本地运行的 macOS 网页素材下载工具。输入网页地址，识别图片、GIF、视频和音频，预览并勾选后批量保存到指定文件夹。

应用内名称为 **Media Harbor**，当前版本为 **v0.2.0**。仓库名称为 `DownloaderForMac`。

## 下载与使用

在 [Releases](https://github.com/Jin-Hsu/DownloaderForMac/releases) 下载 `Media-Harbor-v0.2.0-macOS-arm64.zip`，解压后将 `Media Harbor.app` 拖入“应用程序”文件夹。

现有安装包面向 Apple Silicon（M 系列芯片）Mac，使用本地临时签名，尚未经过 Apple 公证。Intel Mac 需自行构建，当前没有经过验证的 Intel 安装包。

1. 打开应用，粘贴网页地址或素材直链。
2. 点击“扫描素材”，等待结果出现。
3. 按图片、GIF、视频、音频筛选，勾选需要的素材。
4. 点击“下载所选”，选择保存文件夹。

## 功能

- 扫描网页中的图片、媒体标签、链接、背景图及已加载资源。
- 动态网页扫描失败时尝试解析网页源码。
- 识别 JPG/JPEG、PNG、WebP、GIF、MP4、WebM、MP3 等常见资源。
- 图片和视频缩略图预览、分类筛选与批量选择。
- 流式写入下载文件，自动处理重名文件。
- 显示下载进度与具体失败原因。
- 扫描和下载共用应用浏览器会话。

## 从源码运行

本项目使用 Electron、原生 JavaScript、HTML 和 CSS。准备 macOS、Node.js 22 及 npm，然后执行：

```sh
git clone https://github.com/Jin-Hsu/DownloaderForMac.git
cd DownloaderForMac
npm ci
npm run check
npm start
```

私有仓库需要先使用有访问权限的 GitHub 账号完成认证。依赖安装期间需要联网下载 Electron。

## 构建 Mac 应用

```sh
npm run package:mac
```

构建产物位于 `dist/`。现有 v0.2.0 ZIP 是此前生成的 Apple Silicon 安装包；此仓库保留对应应用逻辑，并补充发布说明和版本元数据。依赖由 `package-lock.json` 锁定。

## 文件结构

```text
main.js             网页扫描、会话与下载逻辑
preload.js          应用界面与主进程的通信接口
renderer/
  index.html        界面结构
  styles.css        界面样式
  app.js            筛选、选择与下载交互
package.json        应用信息与构建配置
package-lock.json   锁定依赖版本
```

`node_modules/`、`dist/`、`outputs/`、`work/`、测试下载文件和本机设置不进入源码仓库。安装包通过 Releases 提供。

## 已知限制

- 这是早期版本，识别结果可能包含网站图标、缩略图或无效链接；不保证抓取网页内所有素材或自动选择最高画质。
- HLS/DASH 分片或播放列表暂不自动合并为完整视频。
- 验证页、登录要求、过期链接及网站结构变化可能影响识别和下载。
- 不绕过登录、付费墙、DRM 或网站访问控制；下载和使用素材前请确认相应权限。

反馈问题时，可在 [Issues](https://github.com/Jin-Hsu/DownloaderForMac/issues) 中提供网址、应用版本及界面显示的错误；请勿附带密码、Cookie 或令牌。
