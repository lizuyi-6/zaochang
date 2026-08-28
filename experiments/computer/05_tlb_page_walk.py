"""
Hello Computer · 实验 05: 虚拟地址转换 (TLB 快表 + 二级页表 + 缺页模拟)
适用考点: 408 计组/操作系统联动·虚拟存储器 (VA 虚拟页号 VPN -> TLB -> Page Table -> PA 物理页号 PPN)
"""
from typing import Dict, Optional, Tuple

class VirtualMemorySimulator:
    def __init__(self, page_size_kb: int = 4, tlb_entries: int = 4):
        """
        :param page_size_kb: 页大小 (默认 4KB = 4096 字节, 偏移量占 12 位)
        :param tlb_entries: TLB 槽位数
        """
        self.page_size = page_size_kb * 1024
        self.offset_bits = (self.page_size).bit_length() - 1  # log2(页大小),与 page_size_kb 联动
        self.vpn_bits = 32 - self.offset_bits  # 32 位虚拟地址: VPN 位数随页大小变化
        self.vpn_hex_width = (self.vpn_bits + 3) // 4
        self.offset_hex_width = (self.offset_bits + 3) // 4
        
        # TLB 缓存: key = vpn, value = ppn
        self.tlb: Dict[int, int] = {}
        self.tlb_capacity = tlb_entries
        
        # 模拟页表 (Page Table): key = vpn, value = (ppn, is_valid_present)
        self.page_table: Dict[int, Tuple[int, bool]] = {}

    def map_page(self, vpn: int, ppn: int, valid: bool = True):
        """操作系统在页表中建立映射"""
        self.page_table[vpn] = (ppn, valid)

    def translate_address(self, va: int) -> Optional[int]:
        """
        408 核心大题全链路地址转换模拟:
          1. 拆解 VA -> 虚拟页号 (VPN) + 页内偏移 (Offset)
          2. 查 TLB (快表) -> 若命中, 立即拼接 PPN 得到物理地址 PA (仅 1 次访存/查表)
          3. 若 TLB 缺失 -> 访问主存查页表 (慢表)
          4. 若页表中有效位 Valid=0 -> 触发【缺页中断 (Page Fault)】，操作系统从磁盘调页
          5. 若有效位 Valid=1 -> 命中页表, 将 (VPN -> PPN) 填入 TLB，拼接 PA
        """
        offset_mask = (1 << self.offset_bits) - 1
        offset = va & offset_mask
        vpn = va >> self.offset_bits
        
        print(f"\n>>> 转换虚拟地址 VA = 0x{va:08X}:")
        print(f"  拆解: 虚拟页号 VPN = 0x{vpn:0{self.vpn_hex_width}X} (十进制 {vpn}), 页内偏移 Offset = 0x{offset:0{self.offset_hex_width}X} (十进制 {offset})")
        
        # 1. 查 TLB
        if vpn in self.tlb:
            ppn = self.tlb[vpn]
            pa = (ppn << self.offset_bits) | offset
            print(f"  [1. TLB 查询] -> 【TLB 命中 HIT！】 查得物理页号 PPN = 0x{ppn:05X}")
            print(f"  => 最终物理地址 PA = 0x{pa:08X} (极速完成，无需查内存页表)")
            return pa
        else:
            print(f"  [1. TLB 查询] -> 【TLB 缺失 MISS！】 转入主存查页表...")
            
        # 2. 查主存页表
        if vpn not in self.page_table:
            print(f"  [2. 页表查询] -> 【段错误/未分配】 虚拟页号 {vpn} 未在进程地址空间注册！")
            return None
            
        ppn, valid = self.page_table[vpn]
        if not valid:
            print(f"  [2. 页表查询] -> 【触发缺页中断 Page Fault！】 物理页面未在内存中 (有效位=0)，需由 OS 调页中断处理程序从磁盘读入！")
            return None
            
        # 页表命中，更新 TLB
        print(f"  [2. 页表查询] -> 【页表命中 HIT】 查得物理页号 PPN = 0x{ppn:05X}")
        if len(self.tlb) >= self.tlb_capacity:
            oldest_vpn = next(iter(self.tlb))
            del self.tlb[oldest_vpn]  # 简易 FIFO 替换
        self.tlb[vpn] = ppn
        print(f"  [3. 更新快表] -> 将映射 (VPN: 0x{vpn:05X} => PPN: 0x{ppn:05X}) 写入 TLB")
        
        pa = (ppn << self.offset_bits) | offset
        print(f"  => 最终物理地址 PA = 0x{pa:08X}")
        return pa

if __name__ == "__main__":
    vm = VirtualMemorySimulator(page_size_kb=4, tlb_entries=2)
    # 注册测试页表
    vm.map_page(vpn=0x00001, ppn=0x000AA, valid=True)
    vm.map_page(vpn=0x00002, ppn=0x000BB, valid=True)
    vm.map_page(vpn=0x00003, ppn=0x000CC, valid=False)  # 页面在磁盘上, 模拟缺页
    
    # 第一次访问 0x1020: TLB Miss, 页表 Hit
    vm.translate_address(0x00001020)
    # 第二次访问 0x1050 (同页): TLB Hit!
    vm.translate_address(0x00001050)
    # 访问 0x3010: 缺页中断
    vm.translate_address(0x00003010)
