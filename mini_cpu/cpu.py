"""
Hello Computer · Level 2: Mini RISC-V 5级流水线 CPU 模拟器
实现经典 5 级流水线: IF (取指) -> ID (译码) -> EX (执行) -> MEM (访存) -> WB (写回)
集成:
  1. 寄存器堆 (32个 32位 通用寄存器 x0-x31, x0 恒为 0)
  2. 算术逻辑单元 ALU (ADD, SUB, AND, OR, SLT)
  3. 数据旁路转发单元 (Forwarding Unit: EX/MEM -> EX, MEM/WB -> EX)
  4. 冒险检测与流水线停顿单元 (Hazard Detection: Load-Use Hazard Stall)
  5. 动态时钟周期流水线寄存器时空可视化
"""
from typing import Dict, List, Optional, Tuple

MASK32 = 0xFFFFFFFF

def to_signed32(v: int) -> int:
    """按 32 位有符号数解释 (SLT 的有符号比较依赖它)"""
    return v - 0x100000000 if v & 0x80000000 else v

class Instruction:
    def __init__(self, op: str, rd: int = 0, rs1: int = 0, rs2: int = 0, imm: int = 0, raw_asm: str = ""):
        self.op = op.upper()
        self.rd = rd
        self.rs1 = rs1
        self.rs2 = rs2
        self.imm = imm
        if raw_asm:
            self.raw_asm = raw_asm
        elif self.op == "LW":    # I 型访存: LW rd, imm(rs1)
            self.raw_asm = f"{self.op} x{rd}, {imm}(x{rs1})"
        elif self.op == "SW":    # S 型: SW rs2, imm(rs1)
            self.raw_asm = f"{self.op} x{rs2}, {imm}(x{rs1})"
        elif self.op == "ADDI":  # I 型运算: ADDI rd, rs1, imm
            self.raw_asm = f"{self.op} x{rd}, x{rs1}, {imm}"
        else:                    # R 型: OP rd, rs1, rs2
            self.raw_asm = f"{self.op} x{rd}, x{rs1}, x{rs2}"

    def __repr__(self):
        return self.raw_asm

class PipelineRegister:
    """流水线级间寄存器 (IF/ID, ID/EX, EX/MEM, MEM/WB)"""
    def __init__(self):
        self.inst: Optional[Instruction] = None
        self.pc: int = 0
        self.bubble: bool = True  # 是否为气泡 (NOP)
        
        # 传递的数据与控制信号
        self.rs1_val: int = 0
        self.rs2_val: int = 0
        self.imm: int = 0
        self.alu_result: int = 0
        self.mem_read_data: int = 0
        self.rd: int = 0
        self.reg_write: bool = False
        self.mem_to_reg: bool = False
        self.mem_read: bool = False
        self.mem_write: bool = False

class MiniPipelinedCPU:
    def __init__(self, inst_memory: List[Instruction], data_memory_size: int = 256):
        self.inst_mem = inst_memory
        self.data_mem = [0] * data_memory_size
        self.regs = [0] * 32  # x0 ~ x31
        
        self.pc = 0
        self.cycle = 0
        
        # 4 个级间流水线寄存器
        self.if_id = PipelineRegister()
        self.id_ex = PipelineRegister()
        self.ex_mem = PipelineRegister()
        self.mem_wb = PipelineRegister()
        
        # 统计指标
        self.stalls = 0
        self.forwardings = 0
        self.instructions_retired = 0

    def step(self) -> bool:
        """执行一个时钟周期"""
        self.cycle += 1
        
        # 准备下一个周期的级间寄存器状态
        next_if_id = PipelineRegister()
        next_id_ex = PipelineRegister()
        next_ex_mem = PipelineRegister()
        next_mem_wb = PipelineRegister()
        
        # ------------------------------------------------------------------
        # 5. WB 阶段 (Writeback 写回寄存器)
        # ------------------------------------------------------------------
        if not self.mem_wb.bubble and self.mem_wb.inst:
            write_data = self.mem_wb.mem_read_data if self.mem_wb.mem_to_reg else self.mem_wb.alu_result
            if self.mem_wb.reg_write and self.mem_wb.rd != 0:
                self.regs[self.mem_wb.rd] = write_data
            self.instructions_retired += 1

        # ------------------------------------------------------------------
        # 4. MEM 阶段 (Memory 访存)
        # ------------------------------------------------------------------
        if not self.ex_mem.bubble and self.ex_mem.inst:
            next_mem_wb.bubble = False
            next_mem_wb.inst = self.ex_mem.inst
            next_mem_wb.alu_result = self.ex_mem.alu_result
            next_mem_wb.rd = self.ex_mem.rd
            next_mem_wb.reg_write = self.ex_mem.reg_write
            next_mem_wb.mem_to_reg = self.ex_mem.mem_to_reg
            
            if self.ex_mem.mem_read:
                addr = self.ex_mem.alu_result // 4
                next_mem_wb.mem_read_data = self.data_mem[addr] if 0 <= addr < len(self.data_mem) else 0
            elif self.ex_mem.mem_write:
                addr = self.ex_mem.alu_result // 4
                if 0 <= addr < len(self.data_mem):
                    self.data_mem[addr] = self.ex_mem.rs2_val
        else:
            next_mem_wb.bubble = True

        # ------------------------------------------------------------------
        # 3. EX 阶段 (Execute 执行 / ALU 运算 / Forwarding 数据转发)
        # ------------------------------------------------------------------
        if not self.id_ex.bubble and self.id_ex.inst:
            inst = self.id_ex.inst
            next_ex_mem.bubble = False
            next_ex_mem.inst = inst
            next_ex_mem.rd = self.id_ex.rd
            next_ex_mem.reg_write = self.id_ex.reg_write
            next_ex_mem.mem_to_reg = self.id_ex.mem_to_reg
            next_ex_mem.mem_read = self.id_ex.mem_read
            next_ex_mem.mem_write = self.id_ex.mem_write
            
            # --- 408 核心: 数据旁路转发 (Forwarding Unit) ---
            op_a = self.id_ex.rs1_val
            op_b = self.id_ex.rs2_val
            
            # EX 冒险: 来自 EX/MEM 的转发 (前一条指令的结果刚出 ALU)
            if not self.ex_mem.bubble and self.ex_mem.reg_write and self.ex_mem.rd != 0:
                if self.ex_mem.rd == inst.rs1:
                    op_a = self.ex_mem.alu_result
                    self.forwardings += 1
                if self.ex_mem.rd == inst.rs2 and inst.op not in ["ADDI", "LW"]:
                    op_b = self.ex_mem.alu_result
                    self.forwardings += 1

            # MEM 冒险: 来自 MEM/WB 的转发 (前前一条指令的结果)
            if not self.mem_wb.bubble and self.mem_wb.reg_write and self.mem_wb.rd != 0:
                wb_data = self.mem_wb.mem_read_data if self.mem_wb.mem_to_reg else self.mem_wb.alu_result
                if self.mem_wb.rd == inst.rs1 and (self.ex_mem.bubble or self.ex_mem.rd != inst.rs1):
                    op_a = wb_data
                    self.forwardings += 1
                if self.mem_wb.rd == inst.rs2 and inst.op not in ["ADDI", "LW"] and (self.ex_mem.bubble or self.ex_mem.rd != inst.rs2):
                    op_b = wb_data
                    self.forwardings += 1

            # ALU 运算 (32 位回绕: 结果一律 & MASK32, 保证寄存器堆为真 32 位语义)
            if inst.op == "ADD":
                next_ex_mem.alu_result = (op_a + op_b) & MASK32
            elif inst.op == "ADDI":
                next_ex_mem.alu_result = (op_a + self.id_ex.imm) & MASK32
            elif inst.op == "SUB":
                next_ex_mem.alu_result = (op_a - op_b) & MASK32
            elif inst.op == "AND":
                next_ex_mem.alu_result = op_a & op_b
            elif inst.op == "OR":
                next_ex_mem.alu_result = op_a | op_b
            elif inst.op == "SLT":
                next_ex_mem.alu_result = 1 if to_signed32(op_a) < to_signed32(op_b) else 0
            elif inst.op in ["LW", "SW"]:
                next_ex_mem.alu_result = (op_a + self.id_ex.imm) & MASK32
                next_ex_mem.rs2_val = op_b
        else:
            next_ex_mem.bubble = True

        # ------------------------------------------------------------------
        # 2. ID 阶段 (Instruction Decode 译码 / 读寄存器堆 / 冒险检测)
        # ------------------------------------------------------------------
        hazard_stall = False
        if not self.if_id.bubble and self.if_id.inst:
            inst = self.if_id.inst
            
            # --- 408 核心: Load-Use 数据冒险检测 ---
            # 如果当前 EX 阶段是 Load 指令，且其目的寄存器与 ID 阶段源寄存器冲突 -> 必须插入 1 个周期的 Stall (气泡)
            if not self.id_ex.bubble and self.id_ex.mem_read:
                if self.id_ex.rd != 0 and (self.id_ex.rd == inst.rs1 or (self.id_ex.rd == inst.rs2 and inst.op not in ["ADDI", "LW"])):
                    hazard_stall = True
                    self.stalls += 1
            
            if not hazard_stall:
                next_id_ex.bubble = False
                next_id_ex.inst = inst
                next_id_ex.rd = inst.rd
                next_id_ex.imm = inst.imm
                # 读寄存器堆 (x0 永远为 0)
                next_id_ex.rs1_val = 0 if inst.rs1 == 0 else self.regs[inst.rs1]
                next_id_ex.rs2_val = 0 if inst.rs2 == 0 else self.regs[inst.rs2]
                
                # 设置控制信号
                next_id_ex.reg_write = inst.op in ["ADD", "ADDI", "SUB", "AND", "OR", "SLT", "LW"]
                next_id_ex.mem_to_reg = (inst.op == "LW")
                next_id_ex.mem_read = (inst.op == "LW")
                next_id_ex.mem_write = (inst.op == "SW")
            else:
                # 插入气泡: ID/EX 置为空操作
                next_id_ex.bubble = True
        else:
            next_id_ex.bubble = True

        # ------------------------------------------------------------------
        # 1. IF 阶段 (Instruction Fetch 取指)
        # ------------------------------------------------------------------
        if not hazard_stall:
            if 0 <= self.pc < len(self.inst_mem):
                next_if_id.bubble = False
                next_if_id.inst = self.inst_mem[self.pc]
                next_if_id.pc = self.pc
                self.pc += 1
            else:
                next_if_id.bubble = True
        else:
            # 遇到 Stall: 保持 IF/ID 寄存器与 PC 不变
            next_if_id = self.if_id

        # 推进流水线寄存器
        self.if_id = next_if_id
        self.id_ex = next_id_ex
        self.ex_mem = next_ex_mem
        self.mem_wb = next_mem_wb

        # 检查是否全部指令已流出流水线
        done = (self.pc >= len(self.inst_mem) and 
                self.if_id.bubble and self.id_ex.bubble and 
                self.ex_mem.bubble and self.mem_wb.bubble)
        return not done

    def print_pipeline_state(self):
        """打印当前时钟周期的 5 级流水线状态甘特图与核心寄存器"""
        def format_stage(reg: PipelineRegister):
            if reg.bubble or not reg.inst:
                return "[   BUBBLE   ]"
            return f"[{reg.inst.raw_asm[:12]:^12}]"

        print(f"\n--- 时钟周期 {self.cycle:2d} (PC={self.pc}) ---")
        print(f"  [IF 取指]: {format_stage(self.if_id)}  -->  [ID 译码]: {format_stage(self.id_ex)}  -->  [EX 执行]: {format_stage(self.ex_mem)}  -->  [MEM 访存]: {format_stage(self.mem_wb)}")
        active_regs = {f"x{i}": self.regs[i] for i in range(1, 10) if self.regs[i] != 0}
        if active_regs:
            print(f"  活跃通用寄存器: {active_regs}")
