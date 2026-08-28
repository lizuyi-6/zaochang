"""
Hello Computer · 实验 04: Cache 直接映射与组相联映射模拟器 (含 LRU 替换)
适用考点: 408 计组第四章·高速缓冲存储器 (主存地址分段: Tag/组号/块内偏移, LRU 替换算法, 命中率统计)
"""
from collections import OrderedDict
from typing import List, Tuple

class SetAssociativeCache:
    def __init__(self, cache_size_bytes: int, block_size_bytes: int, ways: int, addr_bits: int = 32):
        """
        初始化组相联 Cache
        :param cache_size_bytes: Cache 总容量 (例如 32KB = 32768)
        :param block_size_bytes: 块大小 (例如 64B)
        :param ways: 相联度 (1=直接映射, 2=2路组相联, 4=4路组相联, ways=num_lines为全相联)
        :param addr_bits: 物理地址总位数 (默认 32 位)
        """
        self.cache_size = cache_size_bytes
        self.block_size = block_size_bytes
        self.ways = ways
        self.addr_bits = addr_bits
        
        self.num_lines = cache_size_bytes // block_size_bytes
        self.num_sets = self.num_lines // ways
        
        # 计算地址字段位数 (408 核心考点)
        import math
        self.offset_bits = int(math.log2(block_size_bytes))
        self.set_bits = int(math.log2(self.num_sets)) if self.num_sets > 1 else 0
        self.tag_bits = addr_bits - self.set_bits - self.offset_bits
        
        # Cache 数据结构: 组列表, 每一组是一个 OrderedDict (实现 LRU)
        # key = tag, value = dirty_bit
        self.sets = [OrderedDict() for _ in range(self.num_sets)]
        
        self.hits = 0
        self.misses = 0

    def parse_address(self, addr: int) -> Tuple[int, int, int]:
        """按 408 标准将物理地址拆分为 Tag、Set(组号)、Offset(块内偏移)"""
        offset_mask = (1 << self.offset_bits) - 1
        offset = addr & offset_mask
        
        if self.set_bits > 0:
            set_mask = (1 << self.set_bits) - 1
            set_idx = (addr >> self.offset_bits) & set_mask
        else:
            set_idx = 0
            
        tag = addr >> (self.offset_bits + self.set_bits)
        return tag, set_idx, offset

    def access(self, addr: int, is_write: bool = False) -> bool:
        """访问一个地址 (读或写)"""
        tag, set_idx, offset = self.parse_address(addr)
        curr_set = self.sets[set_idx]
        
        if tag in curr_set:
            # 命中 (Hit)
            self.hits += 1
            # 更新 LRU: 移动到最新访问端
            curr_set.move_to_end(tag)
            if is_write:
                curr_set[tag] = True  # 标记脏位 (Write-Back)
            return True
        else:
            # 缺失 (Miss)
            self.misses += 1
            if len(curr_set) >= self.ways:
                # 组已满, 触发 LRU 替换 (弹出最久未访问的项)
                evicted_tag, is_dirty = curr_set.popitem(last=False)
            curr_set[tag] = is_write
            return False

    def print_config(self):
        print(f"\n================ Cache 架构配置 (408 地址切分) ================")
        print(f"总容量: {self.cache_size} 字节 | 块大小: {self.block_size} 字节 | 相联度: {self.ways} 路")
        print(f"总行数: {self.num_lines} 行 | 组数: {self.num_sets} 组")
        print(f"{self.addr_bits} 位地址切分:")
        print(f"  [ 主存标记 Tag: {self.tag_bits} 位 ]  [ 组号 Index: {self.set_bits} 位 ]  [ 块内偏移 Offset: {self.offset_bits} 位 ]")

if __name__ == "__main__":
    # 模拟一个 4 组、每组 2 路 (2-Way Set-Associative)、块大小 16 字节的微型 Cache
    cache = SetAssociativeCache(cache_size_bytes=128, block_size_bytes=16, ways=2, addr_bits=16)
    cache.print_config()
    
    # 模拟访问地址序列 (组0/组1 交替演示;同一组内演示 冷启动缺失/时间局部性命中/LRU 驱逐):
    # 0x0000 与 0x0010 Tag 相同(0)但组号不同(0 vs 1) —— 演示地址切分;
    # 第 6 步 0x0080 缺失时组 0 已满,LRU 驱逐的是第 5 步刚访问过的 0x0000 之前的 0x0040;
    # 第 7 步重访 0x0040 必然缺失 —— 证明 LRU 选对了受害者(若误驱 0x0000,第 5 步的命中就不存在)。
    test_addrs = [0x0000, 0x0010, 0x0000, 0x0040, 0x0000, 0x0080, 0x0040, 0x0080]
    print("\n>>> 开始单步地址访问追踪:")
    for addr in test_addrs:
        tag, s_idx, off = cache.parse_address(addr)
        hit = cache.access(addr)
        status = "【命中 HIT】" if hit else "【缺失 MISS】"
        print(f"访问地址 0x{addr:04X} -> Tag=0x{tag:X}, 组号={s_idx}, 偏移={off:2d} => {status}")
        
    total = cache.hits + cache.misses
    hit_rate = (cache.hits / total) * 100
    print(f"\n统计结果: 总访问 {total} 次, 命中 {cache.hits} 次, 缺失 {cache.misses} 次, 命中率 = {hit_rate:.1f}%")
