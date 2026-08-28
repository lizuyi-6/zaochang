"""
Hello Computer · 实验 02: IEEE 754 单精度浮点数二进制拆解与对阶舍入模拟
适用考点: 408 计组第二章·浮点数表示与运算 (单精度 32 位格式: 1位符号, 8位阶码-移码偏置127, 23位尾数)
"""
import struct

def parse_float_ieee754(f: float):
    """拆解单精度浮点数的 32 位机器码"""
    # 打包为 4 字节单精度浮点数二进制
    packed = struct.pack(">f", f)
    raw_int = struct.unpack(">I", packed)[0]
    bin_str = bin(raw_int)[2:].zfill(32)
    
    sign_bit = bin_str[0]
    exp_bits = bin_str[1:9]
    frac_bits = bin_str[9:]
    
    exp_val = int(exp_bits, 2)
    true_exp = exp_val - 127  # 阶码真实指数
    
    print(f"\n================ IEEE 754 单精度分析: {f} ================")
    print(f"32 位二进制码 : {sign_bit} | {exp_bits} | {frac_bits}")
    print(f"十六进制表示   : 0x{raw_int:08X}")
    print(f"1. 符号位 (S)  : {sign_bit} ({'负数 -' if sign_bit == '1' else '正数 +'})")
    print(f"2. 阶码位 (E)  : {exp_bits} (十进制移码={exp_val}, 真实阶码 E-127 = {true_exp})")
    print(f"3. 尾数位 (M)  : {frac_bits}")
    
    if exp_val == 0:
        if int(frac_bits, 2) == 0:
            print("=> 【特殊值】: 0.0 (符号位决定 +0 或 -0)")
        else:
            print("=> 【非规格化数 (Subnormal)】: 隐藏位为 0，指数固定为 -126，用于渐进下溢。")
    elif exp_val == 255:
        if int(frac_bits, 2) == 0:
            print("=> 【特殊值】: 无穷大 (Infinity)")
        else:
            print("=> 【特殊值】: NaN (Not a Number, 非数值/非法计算)")
    else:
        # 规格化数 (Normal)
        mantissa_val = 1.0
        for i, bit in enumerate(frac_bits):
            if bit == '1':
                mantissa_val += 2 ** (-(i + 1))
        print(f"=> 【规格化数 (Normal)】: 隐含最高位 1，有效数字 = 1.{frac_bits[:8]}... (十进制={mantissa_val:.7f})")
        reconstructed = ((-1) ** int(sign_bit)) * mantissa_val * (2 ** true_exp)
        print(f"=> 重构真值公式: (-1)^{sign_bit} * {mantissa_val:.7f} * 2^{true_exp} = {reconstructed}")

def simulate_float_alignment(exp_a: int, frac_a: str, exp_b: int, frac_b: str):
    """
    浮点数加法第一步：对阶模拟 (小阶向大阶看齐 / 408 必考大题步骤)
    """
    print(f"\n>>> 浮点数加法对阶模拟:")
    print(f"  数 A: 阶码 E_A = {exp_a}, 尾数 M_A = 1.{frac_a}")
    print(f"  数 B: 阶码 E_B = {exp_b}, 尾数 M_B = 1.{frac_b}")
    
    delta_e = exp_a - exp_b
    if delta_e == 0:
        print("  => 两数阶码相等，无需对阶。")
    elif delta_e > 0:
        print(f"  => E_A > E_B (阶差 delta = {delta_e})：【小阶向大阶看齐】")
        print(f"     数 B 阶码增加 {delta_e} 变为 {exp_a}，尾数 M_B 右移 {delta_e} 位（低位移出部分可能引起舍入误差）。")
    else:
        delta_e = abs(delta_e)
        print(f"  => E_B > E_A (阶差 delta = {delta_e})：【小阶向大阶看齐】")
        print(f"     数 A 阶码增加 {delta_e} 变为 {exp_b}，尾数 M_A 右移 {delta_e} 位。")

if __name__ == "__main__":
    parse_float_ieee754(12.5)
    parse_float_ieee754(-0.75)
    parse_float_ieee754(0.0)
    parse_float_ieee754(float("nan"))
    
    # 模拟对阶
    simulate_float_alignment(5, "101000", 2, "001100")
