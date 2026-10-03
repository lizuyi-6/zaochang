// 把本轮「全站重录 + 深度交互」的发现并入 qa-run.json。
import fs from "node:fs";
const p = "qa-runs/2026-10-03-regression/qa-run.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));

j.scope.included.push("深度交互全量:桌面 66 + 手机 15 + 平板 10 = 91 个页面录制,每页多容器逐屏滚动 + 结构性点击 + 录像 + 观察者");
j.scope.included.push("侧栏真实点击走查(精确 href,11 个目的地)");
j.scope.included.push("手机导航可达性穷举:7 个种子页 x 逐屏滚动 x 命中测试");
j.scope.capabilities.push({ name: "Full lecture playthrough (all steps + quick_check + board mermaid/KaTeX)", available: false, note: "仍只到第 1-2 步" });
j.scope.capabilities.push({ name: "Keyboard accessibility walkthrough (Tab order, focus, Esc)", available: false, note: "本轮只做鼠标与触达点击" });
j.scope.capabilities.push({ name: "Production write actions (create post / like / pay / upload / refund)", available: false, note: "只验证了无凭据时正确 fail-closed" });

j.findings.push(
  {
    id: "F-007", hypothesis_id: "H-001",
    title: "[新,高] 手机端 6 个主目的地完全没有导航入口",
    status: "confirmed", severity: "high",
    impact: "390x844 下,遍历 7 个种子页、逐屏滚动、命中测试后,/challenges /collections /docs /studio /developers /wallet 全程零可达入口;手机用户只能到 12 个主板块中的 6 个。源码 site-shell.tsx:58 mobileTabHrefs 只有 4 项,且移动端导航无任何溢出/更多触发器,被裁掉的 6 项没有兜底。/studio/new(FAB 可点)通达,但 /studio 本身不可点。",
    expected: "裁剪 tab 栏是有意的(源码注释「主入口白名单」),但被裁项应有溢出菜单兜底",
    expectation_basis: "site-shell.tsx 源码 + 运行时可达性穷举",
    actual: "mobileTabHrefs 只含 4 项(/、/discover、/bookshelf、/circles);移动端 nav 只渲染这 4 项 + deep-mobile-create(/studio/new);运行时 7 种子页逐屏命中测试,该 6 项从未进入视口",
    steps: [
      "读 site-shell.tsx 确认 mobileTabHrefs 与移动端 nav 的渲染范围",
      "390x844 下枚举主屏可见可点链接(带命中测试)",
      "逐屏滚到底统计可见可点链接",
      "跨 7 个种子页取并集,验证不是首页独有",
    ],
    reproduction: { attempts: 7, observed: 7 },
    evidence: ["E-016", "E-017", "E-019"],
    countercheck: {
      alternative: "也许这些目的地从别的页面可达,只是首页没有",
      result: "已排除:跨 /、/discover、/circles、/bookshelf、/collections、/challenges、/docs 七个种子页逐屏滚动取并集,该 6 项仍零入口。竞争解释「mobileTabHrefs 裁剪本身是缺陷」不成立 —— 裁剪 tab 有源码注释说明;缺的是溢出菜单。",
      evidence: ["E-017"],
    },
  },
  {
    id: "F-008", hypothesis_id: "H-001",
    title: "91 个页面深度交互录制:产品侧零异常(负面结论)",
    status: "dismissed", severity: "informational",
    impact: "无异常:滚动未到底 0、错误 0、>=400 0、console error 0;左右两栏全程粘性固定;长内容覆盖到位(书籍正文 6429px/12 步)。",
    expected: "深交互可能暴露浅层导航看不到的懒加载失败/滚动端点破版",
    expectation_basis: "oracles:Do not report every layout change as a defect; no observed anomalies means only no observed anomalies in the sampled scope",
    actual: "45-deep-summary.json 聚合 91 个页面录制:全部指标为 0 异常",
    steps: ["四批次 + 两视口共 91 页录制", "聚合滚动覆盖/错误/4xx/console 统计"],
    reproduction: { attempts: 91, observed: 0 },
    evidence: ["E-022"],
    countercheck: {
      alternative: "也许只是没测到",
      result: "覆盖面已记录:手机/平板仅 15/10 页非全量;键盘可达性未测;帧级瞬态不可判定。这些盲区已在报告中列明,故此结论只覆盖采样范围。",
      evidence: ["E-022"],
    },
  },
  {
    id: "F-009", hypothesis_id: "H-001",
    title: "[方法论] 深交互驱动器的四个缺陷均已定位并修正,前三个曾造成假阴性",
    status: "dismissed", severity: "informational",
    impact: "(1) scroll-behavior:smooth 下赋 scrollTop 会启动动画,立即读回仍是旧值 -> 误判没动而 break(/developers/docs 1174px 只滚 1 步);(2) 每步重挑最大可滚动元素 -> 懒加载元素出现后目标换人,下半段永远滚不到;(3) 只取最大容器 -> 漏掉「页面不滚动但固定区域可滚」这一类(/feed 侧栏 62px 整段未测);(4) a:has-text() 匹配祖先 -> 侧栏点击点到 14x14 圆点链接,伪造出「导航在 /feed 坏掉」的假象。",
    expected: "驱动器测出的覆盖率与异常应真实",
    expectation_basis: "自身工具链可信度(oracles:Do not claim an unseen channel was inspected)",
    actual: "四项全部由判别实验定位并修正;修正后导航走查 11/11 正常、/feed 侧栏 62px 被覆盖、/developers/docs 滚到 1236px",
    steps: ["每项假阴性单独设计判别实验", "修正后复跑对照"],
    reproduction: { attempts: 4, observed: 4 },
    evidence: ["E-016", "E-019", "E-022"],
    countercheck: {
      alternative: "第四项可能是真产品缺陷",
      result: "已排除:精确 a[href=\"/circles\"] 点击后 /feed -> /circles -> /challenges 全部正常跳转,产品无损。",
      evidence: ["E-019"],
    },
  }
);

j.coverage.exercised.push({ area: "91 个页面深度交互录制(桌面/手机/平板,多容器滚动+结构点击)", risk: "high", reason: "0 错误 / 0 >=400 / 0 console error / 全部可滚区滚到底;发现 P-101 手机导航缺口", evidence: ["E-022"] });
j.coverage.exercised.push({ area: "侧栏真实点击走查(精确 href)", risk: "high", reason: "11 个目的地全部正常跳转,推翻 v1 的假阳性", evidence: ["E-020"] });
j.coverage.exercised.push({ area: "手机导航可达性穷举(7 种子页 x 逐屏 x 命中测试)", risk: "high", reason: "6 个目的地零入口,源码与运行时双向坐实", evidence: ["E-017"] });
j.coverage.untested.push({ area: "键盘可达性(Tab 序列/焦点顺序/Esc 关闭)", risk: "high", reason: "本轮只做鼠标与触达点击;对一份刚做过 HIG 整改的站点是实质盲区", evidence: [] });
j.coverage.untested.push({ area: "手机/平板全量页面(仅 15/10 页)", risk: "medium", reason: "主站 24 页与动态 17 页只在桌面视口录过", evidence: [] });

j.gate.decision = "not_ready";
j.gate.rationale = "本轮深交互在产品侧未发现新缺陷(91 个页面录制零异常),但挖出一条新的高危问题 P-101(手机端 6/12 主板块无导航入口),且上一轮继承的 R-001(旧产品名残留在账户删除申请邮件正文等处)仍未修。此外键盘可达性完全未测,而这正是一份刚做过 HIG 整改的站点的关键面。是否放行由产品负责人裁决。";
j.gate.required_checks.push({ name: "91 个页面深度交互无异常", result: "passed", evidence: ["E-022"] });
j.gate.required_checks.push({ name: "侧栏导航 11 个目的地可达", result: "passed", evidence: ["E-020"] });
j.gate.required_checks.push({ name: "手机端主导航完整性", result: "failed", evidence: ["E-017"] });
j.gate.required_checks.push({ name: "键盘可达性", result: "not_run", evidence: [] });
j.gate.required_checks.push({ name: "旧产品名 Hyperknow 残留清零", result: "failed", evidence: ["E-004", "E-009"] });

fs.writeFileSync(p, JSON.stringify(j, null, 2), "utf8");
console.log("qa-run.json: 假设", j.hypotheses.length, "发现", j.findings.length, "gate", j.gate.decision);
