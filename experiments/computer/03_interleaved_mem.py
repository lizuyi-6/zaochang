"""
Hello Computer · 实验 03: 多模块低位交叉编址存储器流水线存取模拟
适用考点: 408 计组第三章·存储系统 (低位交叉编址、流水线存取周期 T、总线传输周期 r、模块数 m 满足 m >= T/r)
"""

def simulate_interleaved_memory(num_modules: int, mem_cycle_T: int, bus_cycle_r: int, num_words: int):
    """
    模拟低位交叉编址连续读取 N 个字的流水线时间
    
    408 核心公式:
      每个模块存取周期为 T，总线传输周期为 r。
      为实现无冲突流水线，模块数 m 必须满足: m >= T / r
      连续读取 n 个连续字所需总时间: t = T + (n - 1) * r
    """
    print(f"\n================ 低位交叉存储器流水线模拟 (模块数 m={num_modules}) ================")
    print(f"模块存取周期 T = {mem_cycle_T} ns, 总线传输周期 r = {bus_cycle_r} ns")
    
    min_modules = mem_cycle_T / bus_cycle_r
    print(f"理论无冲突最小模块数 m_min = T / r = {min_modules:.1f}")
    
    if num_modules < min_modules:
        print(f"[警告] 当前模块数 {num_modules} < {min_modules}，连续访问同模块时将发生【流水线停顿/结构冲突】！")
    else:
        print(f"[正常] 当前模块数 {num_modules} >= {min_modules}，可实现完全无间断流水线存取！")
        
    total_time_interleaved = mem_cycle_T + (num_words - 1) * bus_cycle_r
    total_time_sequential = num_words * mem_cycle_T
    
    speedup = total_time_sequential / total_time_interleaved
    
    print(f"\n连续读取连续的 {num_words} 个字:")
    print(f"  1. 传统顺序存储 (高位交叉/单模块) 所需时间: {total_time_sequential} ns (n * T)")
    print(f"  2. 低位交叉流水线存储 所需时间          : {total_time_interleaved} ns (T + (n-1)*r)")
    print(f"  => 提速加速比 (Speedup)               : {speedup:.2f}x\n")
    
    print("时序流水线甘特图 (前 4 个连续地址):")
    for i in range(min(num_words, 6)):
        module_id = i % num_modules
        start_time = i * bus_cycle_r
        end_time = start_time + mem_cycle_T
        print(f"  字地址 {i:2d} (模块 M_{module_id}): 起始传输 [{start_time:3d}ns] -> 模块准备完毕 [{end_time:3d}ns], 总线读出 [{start_time+mem_cycle_T:3d}ns]")

if __name__ == "__main__":
    # 408 经典真题参数: T = 100ns, r = 25ns, m = 4, 读取 16 个连续字
    simulate_interleaved_memory(num_modules=4, mem_cycle_T=100, bus_cycle_r=25, num_words=16)
