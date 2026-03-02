"""
MKP Support Gcode 解析模块
用于处理 Gcode 坐标偏移和格式化
"""

import re
from typing import List, Tuple, Optional


def format_xyze_string(text: str) -> str:
    def process_data(match):
        if match:
            return f"{match.group(1)}{float(match.group(2)):.3f}"
        return ""
    text = re.sub(r'(X)([\d.]+)', lambda m: process_data(m), text)
    text = re.sub(r'(Y)([\d.]+)', lambda m: process_data(m), text)
    text = re.sub(r'(E)([\d.]+)', lambda m: process_data(m), text)
    text = re.sub(r'(Z)([\d.]+)', lambda m: process_data(m), text)
    return text


def Num_Strip(line: str) -> List[float]:
    Source = re.findall(r"\d+\.?\d*", line)
    Source = list(map(float, Source))
    return Source


def Process_GCode_Offset(
    GCommand: str,
    x_offset: float,
    y_offset: float,
    z_offset: float,
    Mode: str,
    machine_max_x: float = 255,
    machine_min_x: float = 0,
    machine_max_y: float = 265,
    machine_min_y: float = 0,
    iron_extrude_ratio: float = 1.0,
    tower_extrude_ratio: float = 1.0
) -> Tuple[str, Optional[str]]:
    if GCommand.find("F") != -1:
        GCommand = GCommand[:GCommand.find("F")]
    GCommand = format_xyze_string(GCommand)
    
    pattern = r"(X|Y|E|Z)(\d+\.\d+)"
    match = re.findall(pattern, GCommand)
    
    values = {}
    error_msg = None
    
    for m in match:
        key, value = m
        if key == 'X':
            new_x = round(float(value) + x_offset, 3)
            values[key] = new_x
            if new_x < machine_min_x or new_x > machine_max_x:
                error_msg = f"X坐标 {new_x} 超出机器范围 ({machine_min_x}-{machine_max_x})"
        elif key == 'Y':
            new_y = round(float(value) + y_offset, 3)
            values[key] = new_y
            if new_y < machine_min_y or new_y > machine_max_y:
                error_msg = f"Y坐标 {new_y} 超出机器范围 ({machine_min_y}-{machine_max_y})"
        elif key == 'E':
            if Mode == 'ironing':
                values[key] = round(float(value) * iron_extrude_ratio, 3)
            elif Mode == 'tower':
                values[key] = round(float(value) * tower_extrude_ratio, 3)
            else:
                values[key] = 12345
        elif key == 'Z' and Mode != 'ironing':
            values[key] = round(float(value) + z_offset, 3)

    for key, value in values.items():
        GCommand = re.sub(rf"{key}\d+\.\d+", f"{key}{value}", GCommand)

    GCommand = re.sub("E12345", "", GCommand)

    if Mode != 'ironing' and Mode != 'tower':
        if (GCommand.find("E") < GCommand.find(";") and GCommand.find(";") != -1 and GCommand.find("E") != -1) or \
           (GCommand.find("E") != -1 and GCommand.find(";") == -1):
            GCommand = GCommand[:GCommand.find("E")]
    
    return GCommand, error_msg


def check_validity_interface_set(interface: List[str]) -> bool:
    Have_Extrude_Flag = False
    dot_count = 0
    for i in interface:
        if i.find(" E") != -1 and i.find(" Z") == -1 and (i.find("X") != -1 or i.find("Y") != -1):
            E_index = i.find("E")
            TmpEChk = i[E_index:]
            if TmpEChk.find("-") == -1:
                dot_count += 1
            if dot_count >= 1:
                Have_Extrude_Flag = True
                break
    return Have_Extrude_Flag


def delete_wipe(lines: List[str]) -> List[str]:
    result = []
    skip_until_wipe_end = False
    
    for line in lines:
        if ";WIPE_START" in line:
            skip_until_wipe_end = True
            continue
        if ";WIPE_END" in line:
            skip_until_wipe_end = False
            continue
        if not skip_until_wipe_end:
            result.append(line)
    
    return result


def extract_layer_info(content: List[str]) -> dict:
    layer_info = {
        'travel_speed': 0,
        'nozzle_diameter': 0.4,
        'first_layer_height': 0.2,
        'typical_layer_height': 0.2,
        'first_layer_speed': 0,
        'retract_length': 0,
        'nozzle_temperature': 210,
        'filament_type': 'PLA'
    }
    
    for line in content:
        if "; travel_speed =" in line:
            layer_info['travel_speed'] = Num_Strip(line)[0] if Num_Strip(line) else 0
        if "; nozzle_diameter = " in line:
            layer_info['nozzle_diameter'] = Num_Strip(line)[0] if Num_Strip(line) else 0.4
        if "; initial_layer_print_height =" in line:
            layer_info['first_layer_height'] = Num_Strip(line)[0] if Num_Strip(line) else 0.2
        if "; layer_height = " in line:
            layer_info['typical_layer_height'] = Num_Strip(line)[0] if Num_Strip(line) else 0.2
        if "; initial_layer_speed =" in line:
            layer_info['first_layer_speed'] = Num_Strip(line)[0] if Num_Strip(line) else 0
        if "; retraction_length = " in line:
            layer_info['retract_length'] = Num_Strip(line)[0] if Num_Strip(line) else 0
        if "; nozzle_temperature = " in line:
            layer_info['nozzle_temperature'] = Num_Strip(line)[0] if Num_Strip(line) else 210
        if "; filament_settings_id " in line:
            if "PETG" in line or "petg" in line:
                layer_info['filament_type'] = 'PETG'
    
    return layer_info


def detect_machine_type(content: List[str]) -> str:
    for line in content:
        if ";===== machine: A1 mini" in line:
            return "A1mini"
        if ";===== machine: A1" in line and "mini" not in line:
            return "A1"
        if ";===== machine: X1" in line:
            return "X1"
        if ";===== machine: P1" in line:
            return "P1"
    return "Unknown"
