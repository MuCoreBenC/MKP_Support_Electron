"""
MKP Support 主处理器模块
用于处理 Gcode 文件并插入涂胶路径
"""

import os
import re
import subprocess
import tempfile
from typing import List, Optional, Tuple, Callable
from dataclasses import dataclass, field

from .config import MKPConfig, load_toml_config
from .gcode_parser import (
    Process_GCode_Offset,
    Num_Strip,
    check_validity_interface_set,
    delete_wipe,
    extract_layer_info,
    detect_machine_type
)


@dataclass
class ProcessResult:
    success: bool
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    stats: dict = field(default_factory=dict)


class MKPProcessor:
    
    def __init__(self, config: MKPConfig):
        self.config = config
        self.progress_callback: Optional[Callable[[int, int], None]] = None
        
    def set_progress_callback(self, callback: Callable[[int, int], None]):
        self.progress_callback = callback
    
    def _update_progress(self, current: int, total: int):
        if self.progress_callback:
            self.progress_callback(current, total)
    
    def process_gcode(self, gcode_path: str, output_path: Optional[str] = None) -> ProcessResult:
        if not os.path.exists(gcode_path):
            return ProcessResult(False, error_message=f"Gcode 文件不存在: {gcode_path}")
        
        if output_path is None:
            base, ext = os.path.splitext(gcode_path)
            output_path = f"{base}_MKP{ext}"
        
        try:
            with open(gcode_path, 'r', encoding='utf-8') as f:
                content = f.readlines()
            
            layer_info = extract_layer_info(content)
            machine_type = detect_machine_type(content)
            
            self._set_machine_bounds(machine_type)
            
            processed_content = self._process_content(content, layer_info, machine_type)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.writelines(processed_content)
            
            return ProcessResult(
                success=True,
                output_path=output_path,
                stats={
                    'machine_type': machine_type,
                    'layer_info': layer_info,
                    'total_lines': len(content)
                }
            )
            
        except Exception as e:
            return ProcessResult(False, error_message=str(e))
    
    def _set_machine_bounds(self, machine_type: str):
        bounds = {
            'A1': {'max_x': 260, 'min_x': -40, 'max_y': 255, 'min_y': 0},
            'A1mini': {'max_x': 180, 'min_x': -10, 'max_y': 180, 'min_y': 0},
            'X1': {'max_x': 255, 'min_x': 0, 'max_y': 265, 'min_y': 0},
            'P1': {'max_x': 255, 'min_x': 0, 'max_y': 265, 'min_y': 0},
        }
        
        if machine_type in bounds:
            b = bounds[machine_type]
            self.config.machine_max_x = b['max_x']
            self.config.machine_min_x = b['min_x']
            self.config.machine_max_y = b['max_y']
            self.config.machine_min_y = b['min_y']
    
    def _process_content(self, content: List[str], layer_info: dict, machine_type: str) -> List[str]:
        result = []
        interface = []
        copy_flag = False
        start_index = 0
        current_layer_height = 0
        last_layer_height = 0
        act_flag = False
        slicer = "OrcaSlicer"
        
        total_lines = len(content)
        
        for i, line in enumerate(content):
            self._update_progress(i, total_lines)
            
            curr_command = line.strip("\n")
            
            if "; BambuStudio" in curr_command:
                slicer = "BambuStudio"
            
            if "; Z_HEIGHT: " in curr_command:
                last_layer_height = current_layer_height
                nums = Num_Strip(curr_command)
                if nums:
                    current_layer_height = nums[0]
            
            if slicer == "BambuStudio" and "; FEATURE: Support interface" in curr_command:
                copy_flag = True
                start_index = i
            
            if slicer == "OrcaSlicer" and "; FEATURE: Ironing" in curr_command:
                copy_flag = True
                start_index = i
            
            if copy_flag and ("; FEATURE:" in curr_command and 
                             "; FEATURE: Support interface" not in curr_command and
                             "; FEATURE: Ironing" not in curr_command):
                copy_flag = False
                end_index = i - 1
                interface.extend(delete_wipe(content[start_index:end_index]))
                
                if check_validity_interface_set(interface):
                    act_flag = True
            
            if "; layer num/total_layer_count" in curr_command and act_flag:
                act_flag = False
                glueing_result = self._generate_glueing_path(
                    interface, current_layer_height, last_layer_height, 
                    machine_type, layer_info
                )
                result.extend(glueing_result)
                interface = []
            
            result.append(line)
        
        return result
    
    def _generate_glueing_path(
        self, 
        interface: List[str], 
        current_layer_height: float,
        last_layer_height: float,
        machine_type: str,
        layer_info: dict
    ) -> List[str]:
        result = []
        
        result.append("; ===== MKP Support Glueing Start =====\n")
        
        th = self.config.toolhead
        wp = self.config.wiping
        
        if machine_type in ["X1", "P1"]:
            result.append("M106 P1 S255\n")
        elif machine_type in ["A1", "A1mini"]:
            result.append("M106 S255\n")
        
        result.append(f"G1 Z{round(current_layer_height + th.z_offset + 3, 3)} ; Rise nozzle\n")
        
        for line in th.custom_mount_gcode.strip().split("\n"):
            if line.strip():
                result.append(f"{line.strip()}\n")
        
        result.append("; Glueing path start\n")
        result.append(f"G1 F{int(th.speed_limit * 60)}\n")
        
        for line in interface:
            if line.find("G1 ") != -1 and line.find("G1 E") == -1 and line.find("G1 F") == -1:
                if line.find("G1 X") != -1 or line.find("G1 Y") != -1:
                    processed, error = Process_GCode_Offset(
                        line.strip(),
                        th.x_offset,
                        th.y_offset,
                        th.z_offset,
                        'normal',
                        self.config.machine_max_x,
                        self.config.machine_min_x,
                        self.config.machine_max_y,
                        self.config.machine_min_y
                    )
                    if processed:
                        result.append(f"{processed}\n")
        
        result.append("; Glueing path end\n")
        
        for line in th.custom_unmount_gcode.strip().split("\n"):
            if line.strip():
                result.append(f"{line.strip()}\n")
        
        result.append(f"G1 Z{round(current_layer_height, 3)} ; Restore Z\n")
        result.append("; ===== MKP Support Glueing End =====\n")
        
        return result


def process_with_external(
    toml_path: str, 
    gcode_path: str, 
    external_path: str = "external/MKPSupport.exe",
    use_source: bool = False
) -> ProcessResult:
    if not os.path.exists(toml_path):
        return ProcessResult(False, error_message=f"配置文件不存在: {toml_path}")
    
    if not os.path.exists(gcode_path):
        return ProcessResult(False, error_message=f"Gcode 文件不存在: {gcode_path}")
    
    try:
        if use_source:
            source_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "MKPSupport"))
            if not os.path.exists(os.path.join(source_dir, "main.py")):
                return ProcessResult(False, error_message=f"源码目录不存在: {source_dir}")
            
            abs_toml = os.path.abspath(toml_path)
            abs_gcode = os.path.abspath(gcode_path)
            
            cmd = ["python", "main.py", "--Toml", abs_toml, "--Gcode", abs_gcode]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=source_dir)
        else:
            if not os.path.exists(external_path):
                return ProcessResult(False, error_message=f"外部程序不存在: {external_path}")
            
            cmd = [external_path, '--Toml', toml_path, '--Gcode', gcode_path]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            base, ext = os.path.splitext(gcode_path)
            output_path = f"{base}_Output.gcode"
            return ProcessResult(success=True, output_path=output_path)
        else:
            return ProcessResult(False, error_message=result.stderr or result.stdout)
            
    except subprocess.TimeoutExpired:
        return ProcessResult(False, error_message="处理超时")
    except Exception as e:
        return ProcessResult(False, error_message=str(e))
