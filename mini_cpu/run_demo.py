"""
Hello Computer · Level 2: Mini RISC-V 5级流水线 CPU 运行演示
演示 408 高频命题场景:
  1. RAW 数据相关与 Forwarding 旁路转发
  2. Load-Use 冒险与自动插入 1 个周期的 Stall (气泡)
  3. 最终寄存器与内存状态验证
"""
from cpu import MiniPipelinedCPU, Instruction

def run_sample_program():
    print("================================================================================")
    print("        Hello Computer · Mini RISC-V 5级流水线处理器仿真启动")
    print("================================================================================")
    
    # 408 经典测试汇编序列:
    # 1. ADDI x1, x0, 10      # x1 = 10
    # 2. ADDI x2, x0, 20      # x2 = 20
    # 3. ADD  x3, x1, x2      # x3 = x1 + x2 = 30  (依赖 x1, x2 -> 触发 EX-to-EX 转发)
    # 4. SW   x3, x0, 0       # Mem[0] = x3 = 30   (依赖 x3)
    # 5. LW   x4, x0, 0       # x4 = Mem[0] = 30
    # 6. SUB  x5, x4, x1      # x5 = x4 - x1 = 20  (Load-Use 冒险! 依赖 x4 -> 必须 Stall 1 周期)
    # 7. AND  x6, x5, x3      # x6 = 20 & 30
    
    instructions = [
        Instruction("ADDI", rd=1, rs1=0, imm=10, raw_asm="ADDI x1, x0, 10"),
        Instruction("ADDI", rd=2, rs1=0, imm=20, raw_asm="ADDI x2, x0, 20"),
        Instruction("ADD",  rd=3, rs1=1, rs2=2,  raw_asm="ADD  x3, x1, x2"),
        Instruction("SW",   rd=0, rs1=0, rs2=3, imm=0, raw_asm="SW   x3, 0(x0)"),
        Instruction("LW",   rd=4, rs1=0, imm=0,  raw_asm="LW   x4, 0(x0)"),
        Instruction("SUB",  rd=5, rs1=4, rs2=1,  raw_asm="SUB  x5, x4, x1"),
        Instruction("AND",  rd=6, rs1=5, rs2=3,  raw_asm="AND  x6, x5, x3"),
    ]
    
    print("\n待执行汇编程序:")
    for idx, inst in enumerate(instructions):
        print(f"  [{idx*4:04X}] {inst.raw_asm}")
        
    cpu = MiniPipelinedCPU(instructions)
    
    print("\n================ 开始逐周期流水线时空仿真 ================")
    while cpu.step():
        cpu.print_pipeline_state()
        if cpu.cycle > 30:  # 安全熔断
            break
            
    print("\n================ 流水线执行完毕统计 ================")
    print(f"总消耗时钟周期数 (Cycles) : {cpu.cycle}")
    print(f"成功退休指令数 (Retired) : {cpu.instructions_retired}")
    print(f"触发数据转发次数 (Forward) : {cpu.forwardings}")
    print(f"触发流水线停顿次数 (Stall) : {cpu.stalls}")
    cpi = cpu.cycle / cpu.instructions_retired if cpu.instructions_retired > 0 else 0
    print(f"平均每条指令时钟周期 CPI  : {cpi:.2f} (理想流水线接近 1.0)")
    
    print("\n最终通用寄存器堆状态:")
    for i in range(1, 7):
        print(f"  x{i} = {cpu.regs[i]}")
    print(f"内存 Mem[0] = {cpu.data_memory[0] if hasattr(cpu, 'data_memory') else cpu.data_mem[0]}")

if __name__ == "__main__":
    run_sample_program()
