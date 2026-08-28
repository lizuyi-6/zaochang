# Hello Computer · Mini RISC-V 5级流水线 CPU 模拟器 (Level 2)

> 用最精简、最透明的 Python 代码，实现经典 5 级流水线（IF-ID-EX-MEM-WB），直接打破 408 数据通路与流水线大题的“黑盒感”。

## 架构特性

1. **经典 5 级流水线结构**：
   - **IF (Instruction Fetch)**：从指令存储器取指，维护程序计数器 `PC`。
   - **ID (Instruction Decode)**：译码操作码，读取通用寄存器堆（`x0~x31`，`x0` 恒为 0），检测数据冒险。
   - **EX (Execute)**：ALU 算术逻辑运算、地址加法计算，以及 **数据旁路转发（Forwarding Unit）**。
   - **MEM (Memory Access)**：主存数据读写（LW / SW）。
   - **WB (Writeback)**：将 ALU 结果或访存读出数据写回目的寄存器 `rd`。
2. **408 核心机制硬件级还原**：
   - **RAW 数据冒险与 Forwarding**：从 `EX/MEM` 与 `MEM/WB` 级间寄存器自动检测冲突并旁路转发。
   - **Load-Use 冒险与 Stall 气泡插入**：当下一条指令需要刚被 `LW` 读取的寄存器时，自动插入 1 周期气泡并锁定 `IF/ID` 寄存器。
   - **逐周期可视化甘特图**：动态打印每个周期 5 个流水线寄存器中的指令流动情况。

## 快速运行

```bash
cd mini_cpu
python run_demo.py
```
