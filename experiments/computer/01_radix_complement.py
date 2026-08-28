"""
Hello Computer · 实验 01: 进制、定点数编码与加减法双符号位溢出检测
适用考点: 408 计组第二章·数据的表示与运算 (原码/反码/补码/移码/双符号位变形补码)
"""

def to_binary_str(val: int, bits: int) -> str:
    """格式化为指定位数的二进制字符串"""
    mask = (1 << bits) - 1
    return bin(val & mask)[2:].zfill(bits)

def format_codes(n: int, bits: int = 8):
    """计算并在终端打印指定整数的原码、反码、补码、移码 (以 8 位为例)"""
    max_val = (1 << (bits - 1)) - 1
    min_val = -(1 << (bits - 1))
    
    print(f"\n================ 整数 {n} 的定点编码 (字长 {bits} 位) ================")
    if not (min_val <= n <= max_val):
        print(f"[警告] {n} 超出 {bits} 位有符号数表示范围 [{min_val}, {max_val}]")
        return

    # 1. 补码 (Two's Complement)
    comp_val = n & ((1 << bits) - 1)
    comp_str = bin(comp_val)[2:].zfill(bits)
    
    # 2. 原码 (Sign-Magnitude): 表示范围 [-max_val, +max_val],无法表示 -2^(bits-1)
    if n >= -max_val:
        if n >= 0:
            true_str = bin(n)[2:].zfill(bits)
        else:
            true_str = "1" + bin(abs(n))[2:].zfill(bits - 1)
    else:
        true_str = None

    # 3. 反码 (One's Complement): 与原码同范围,同样无法表示 -2^(bits-1)
    if n >= -max_val:
        if n >= 0:
            ones_str = bin(n)[2:].zfill(bits)
        else:
            ones_val = ((1 << (bits - 1)) - 1) - abs(n)
            ones_str = "1" + bin(ones_val)[2:].zfill(bits - 1)
    else:
        ones_str = None
        
    # 4. 移码 (Excess/Bias Code: 偏置常数 2^(bits-1))
    offset = 1 << (bits - 1)
    excess_val = n + offset
    excess_str = bin(excess_val)[2:].zfill(bits)
    
    sm_absent = f"不存在 ({bits} 位原码/反码表示范围为 [{-max_val}, {max_val}],表示不了 {n})"
    print(f"真值 (Decimal)   : {n}")
    print(f"原码 [X]_原     : " + (f"{true_str[0]},{true_str[1:]}" if true_str else sm_absent))
    print(f"反码 [X]_反     : " + (f"{ones_str[0]},{ones_str[1:]}" if ones_str else sm_absent))
    print(f"补码 [X]_补     : {comp_str[0]},{comp_str[1:]}")
    print(f"移码 [X]_移     : {excess_str[0]},{excess_str[1:]} (补码符号位取反即为移码)")

def add_with_double_sign(a: int, b: int, bits: int = 8):
    """
    双符号位变形补码加法与溢出判断 (模 4 补码 / 408 大题常考)
    符号位:
      00: 结果为正, 无溢出
      11: 结果为负, 无溢出
      01: 正溢出 (上溢)
      10: 负溢出 (下溢)
    """
    print(f"\n>>> 双符号位加法模拟: ({a}) + ({b}) (有效数值位 {bits-1} 位, 2位符号位)")
    
    # 转换为双符号位补码 (模 2^(bits+1))
    total_bits = bits + 1  # 2位符号位 + (bits-1)位数值位
    a_comp = a & ((1 << total_bits) - 1)
    b_comp = b & ((1 << total_bits) - 1)
    
    sum_val = (a_comp + b_comp) & ((1 << total_bits) - 1)
    
    a_bin = bin(a_comp)[2:].zfill(total_bits)
    b_bin = bin(b_comp)[2:].zfill(total_bits)
    sum_bin = bin(sum_val)[2:].zfill(total_bits)
    
    s1, s2 = sum_bin[0], sum_bin[1]
    
    print(f"  [A]_补 : {a_bin[:2]},{a_bin[2:]}")
    print(f"+ [B]_补 : {b_bin[:2]},{b_bin[2:]}")
    print(f"-----------------------------")
    print(f"  [和]_补: {sum_bin[:2]},{sum_bin[2:]}")
    
    if s1 == "0" and s2 == "0":
        print("  => 符号位 00: 结果为正数, 无溢出。")
    elif s1 == "1" and s2 == "1":
        print("  => 符号位 11: 结果为负数, 无溢出。")
    elif s1 == "0" and s2 == "1":
        print("  => 符号位 01: 【正溢出 (上溢)】！最高符号位0代表应当为正，第二符号位1代表数值位进位侵占了符号位。")
    elif s1 == "1" and s2 == "0":
        print("  => 符号位 10: 【负溢出 (下溢)】！最高符号位1代表应当为负，第二符号位0代表数值位借位破坏了符号位。")

if __name__ == "__main__":
    format_codes(85, 8)
    format_codes(-85, 8)
    format_codes(-128, 8)   # 补码/移码可表示,原码/反码不存在 —— 408 易错点
    
    # 测试无溢出与溢出情况
    add_with_double_sign(45, 30, 8)    # 75, 无溢出
    add_with_double_sign(80, 60, 8)    # 140 > 127, 正溢出 (01)
    add_with_double_sign(-80, -70, 8)  # -150 < -128, 负溢出 (10)
