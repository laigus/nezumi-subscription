# 账耗

<p align="center"><img src="build/icon.png" alt="账耗图标" width="128" /></p>

一款运行在 Windows 上的本地账号与订阅管理工具，提供到期提醒、费用统计和透明悬浮界面。

## 主要功能

- 每条记录都可独立开启订阅、标记已充值按量消费。
- 列表左侧只保留名称、类别和地址；订阅直接显示到期与金额，充值状态显示在右侧费用栏。
- 订阅支持到期提醒；不同币种费用会折算为人民币汇总，联网失败时使用上次汇率。
- 支持类别排序、搜索、排序、“仅看订阅”筛选和快速打开登录地址。
- 导入与导出集中在一个“表格”菜单；明文 XLSX 按类别使用独立工作表。
- 支持界面透明度、声音和窗口悬浮设置。
- 关闭窗口悬浮时遵循普通窗口层级，可正常点击或切换回前台。
- 账号、密码、地址和备注使用 Windows 用户凭据加密保存。

## 环境要求

- Windows 10 / 11
- Node.js 22 或更高版本
- npm

## 安装依赖

```powershell
npm install
```

## 开发运行

直接运行源码，不生成发布程序：

```powershell
npm start
```

## 检查与测试

```powershell
npm run check
npm test
```

- `npm run check`：检查 JavaScript 语法。
- `npm test`：运行数据、日期、费用、存储、表格和界面静态回归测试。

## 构建 Windows 安装版

生成 Windows x64 安装程序：

```powershell
npm run dist
```

安装包输出到：

```text
release/账耗-Setup-<版本号>.exe
```

`<版本号>` 自动读取 `package.json` 的 `version` 字段。

双击安装包后可选择安装目录；安装程序会创建桌面快捷方式和开始菜单快捷方式。后续通过已安装的应用启动，不再执行单文件便携版的逐次解压流程。

完整的构建与安装流程：

```powershell
npm install
npm run dist
```

随后运行 `release/账耗-Setup-<版本号>.exe` 完成安装。

## 快捷键

- `Ctrl + N`：添加记录
- `Ctrl + K`：聚焦搜索
- `Esc`：关闭当前弹窗

## 数据与安全

数据保存在 Electron 当前用户数据目录的 `vault.json` 中，保存前会生成 `vault.json.bak`。账号、密码、地址和备注通过 Electron `safeStorage` 使用当前 Windows 用户凭据加密。

点击应用左下角的“本地保险库”可以打开数据目录。

点击左下角“表格”，再选择“导出”，可将全部记录保存为 XLSX，每个类别对应一个工作表。导出的账号、密码、地址和备注可以直接阅读，不使用加密；请自行保管该文件。

在“表格”菜单选择“导入”可追加导入 XLSX。工作表名称作为类别名称，缺少的类别会自动创建；应用会先校验整张表，再将账号、密码、地址和备注加密写入本地保险库。建议先导出一份表格作为填写模板。

## 项目结构

```text
build/          Windows 应用图标
docs/           架构与数据模型
src/main/       Electron 主进程与本地存储
src/renderer/   界面与交互
src/shared/     公共业务逻辑
tests/          单元测试
```

## 许可证

MIT
