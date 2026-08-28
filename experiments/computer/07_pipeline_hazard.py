"""
Hello Computer · 实验 07: 5 级指令流水线数据冒险 (RAW) 与气泡 / Forwarding 模拟
适用考点: 408 计组第八章·指令流水线 (IF-ID-EX-MEM-WB, RAW 数据冒险, 插入 NOP 气泡 vs 专用数据旁路转发)
"""
from typing import List

class Instruction:
    def __init__(self, name: str, dest: str, src1: str, src2: str, is_load: bool = False):
        self.name = name
        self.dest = dest
        self.src1 = src1
        self.src2 = src2
        self.is_load = is_load

def simulate_pipeline(instructions: List[Instruction], enable_forwarding: bool = False):
    """
    模拟执行指令序列的 5 级流水线时空图
    5 级阶段: IF (取指), ID (译码/读寄存器), EX (执行/ALU), MEM (访存), WB (写回寄存器)
    """
    mode_name = "【启用数据旁路转发 Forwarding】" if enable_forwarding else "【未启用转发 (需插入 Stall 气泡)】"
    print(f"\n================ 5 级流水线时空仿真 {mode_name} ================")

    # 经典 MIPS/RISC-V 5 级流水线时序约定:
    # - 指令 j 于周期 if_j 取指: ID=if_j+1, EX=if_j+2, MEM=if_j+3, WB=if_j+4;
    # - WB 前半周期写寄存器、ID 后半周期读寄存器 (同一周期内先写后读无需等待)。
    #   无转发时消费者 ID 须 >= 生产者 WB 周期, 即 消费者IF >= if_j+3:
    #   程序距离 d 的 RAW 需要 max(0, 3-d) 个停顿 —— 距离 1 需 2 个, 距离 2 需 1 个, >=3 免停顿。
    # - 启用 Forwarding 时: ALU 结果在 EX 阶段末就绪,直接旁路送到后续指令的 EX 输入端 (0 周期惩罚);
    #   Load-Use 冒险: Load 结果在 MEM 阶段末就绪,距离 1 的消费者仍需 1 个周期 Stall, 距离 >=2 免停顿。
    # 注意 RAW 检测必须扫描窗口内全部先前指令, 不能只看紧邻前一条 ——
    # 距离 2 的相关在中间指令不停顿时同样需要 1 个停顿 (中间指令停顿把消费者推晚后,约束自然满足)。

    print("指令序列:")
    for idx, inst in enumerate(instructions):
        print(f"  I{idx}: {inst.name} {inst.dest}, {inst.src1}, {inst.src2}")

    print("\n流水线调度甘特图:")
    if_cycles: List[int] = []  # 每条指令实际 IF 的周期 (含上游停顿推晚)
    total_stalls = 0
    for i, inst in enumerate(instructions):
        natural = (if_cycles[-1] + 1) if if_cycles else 1  # 无新增冒险时的 IF 周期
        required = natural
        if enable_forwarding:
            # 有转发: 仅紧邻的 Load-Use 需要停顿
            if i > 0:
                prev = instructions[i - 1]
                if prev.is_load and prev.dest and (prev.dest == inst.src1 or prev.dest == inst.src2):
                    required = max(required, if_cycles[i - 1] + 2)
        else:
            # 无转发: 检查窗口内全部先前生产者, 取最紧约束 (消费者IF >= 生产者IF + 3)
            for j in range(i):
                prev = instructions[j]
                if prev.dest and (prev.dest == inst.src1 or prev.dest == inst.src2):
                    required = max(required, if_cycles[j] + 3)
        stall = required - natural
        total_stalls += stall
        if_cycles.append(required)

        pipeline_str = "      " * (natural - 1)
        pipeline_str += "[STALL]" * stall + " [IF]  [ID]  [EX] [MEM]  [WB]"
        print(f"  I{i}: {pipeline_str}")

    print(f"共插入 {total_stalls} 个 Stall 气泡, 最后一条指令 WB 于周期 {if_cycles[-1] + 4} 结束")

if __name__ == "__main__":
    test_prog = [
        Instruction("ADD", dest="R1", src1="R2", src2="R3"),
        Instruction("SUB", dest="R4", src1="R1", src2="R5"), # RAW 冲突: 依赖 R1 (距离 1)
        Instruction("AND", dest="R6", src1="R1", src2="R7"), # 依赖 R1 (距离 2; 上面的停顿已把本指令推晚, 自身免停顿)
    ]

    simulate_pipeline(test_prog, enable_forwarding=False)
    simulate_pipeline(test_prog, enable_forwarding=True)

    # 距离 2 且中间指令不停顿: I2 依赖 I0 的 R1, 中间 I1 与 R1 无关 ——
    # 无转发时 I2 自身必须停顿 1 个周期 (这正是"只看紧邻前一条"会漏算的情形)
    dist2_prog = [
        Instruction("ADD", dest="R1", src1="R2", src2="R3"),
        Instruction("ADD", dest="R4", src1="R5", src2="R6"), # 与 R1 无关, 不停顿
        Instruction("SUB", dest="R7", src1="R1", src2="R8"), # RAW: 依赖 I0 的 R1 (距离 2)
    ]
    simulate_pipeline(dist2_prog, enable_forwarding=False)
    simulate_pipeline(dist2_prog, enable_forwarding=True)
