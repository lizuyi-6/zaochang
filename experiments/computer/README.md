# Hello Computer · 考研 408 纯 Python 硬件微实验集 (Level 1)

> 零沉重依赖，纯原生 Python 3 实现，用于可视化验证 408 计算机组成原理高频核心计算与数据通路。

## 实验清单

| 脚本文件 | 对应章节 | 核心考点与模拟功能 |
| :--- | :--- | :--- |
| `01_radix_complement.py` | 第 04-05 章 | 原码/反码/补码/移码转换与加减法双符号位（模4补码）溢出检测 |
| `02_ieee754_parser.py` | 第 07-08 章 | IEEE 754 单精度 32 位浮点数二进制拆解、特殊值判定与对阶舍入过程 |
| `03_interleaved_mem.py` | 第 13 章 | 多模块低位交叉编址流水线存取周期 $T$、总线传输周期 $r$ 与加速比模拟 |
| `04_cache_simulator.py` | 第 14-17 章 | 直接映射/组相联 Cache 32位地址分段（Tag/Index/Offset）与 LRU 命中率跟踪 |
| `05_tlb_page_walk.py` | 第 21-22 章 | $VA \to TLB \to PageTable \to PA$ 虚拟地址转换全链路与缺页中断模拟 |
| `06_expanding_opcode.py` | 第 23 章 | 扩展操作码技术分配方案、前缀保留规则与最大指令数数学不等式验证 |
| `07_pipeline_hazard.py` | 第 31-33 章 | 5 级指令流水线 RAW 数据相关、插入 Stall 气泡与 Forwarding 旁路转发 |
| `08_interrupt_mask.py` | 第 40 章 | 多重中断处理优先级与中断屏蔽字（Interrupt Mask）动态嵌套时序跟踪 |

## 运行方式

无需安装任何第三方库（仅使用 Python 原生内置模块）：

```bash
python experiments/computer/01_radix_complement.py
python experiments/computer/02_ieee754_parser.py
python experiments/computer/04_cache_simulator.py
python experiments/computer/05_tlb_page_walk.py
python experiments/computer/07_pipeline_hazard.py
```
