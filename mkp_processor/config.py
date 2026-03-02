"""
MKP Support 配置模块
用于读取和管理 TOML 配置文件
"""

import os
import toml
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime


@dataclass
class ToolheadConfig:
    speed_limit: float = 69.0
    x_offset: float = 0.0
    y_offset: float = 0.0
    z_offset: float = 3.8
    custom_mount_gcode: str = ""
    custom_unmount_gcode: str = ""


@dataclass
class WipingConfig:
    have_wiping_components: bool = False
    wiper_x: float = 20.0
    wiper_y: float = 20.0
    wipetower_speed: float = 200.0
    nozzle_cooling_flag: bool = False
    iron_apply_flag: bool = False
    user_dry_time: int = 0
    force_thick_bridge_flag: bool = True
    support_extrusion_multiplier: float = 0.8


@dataclass
class MKPConfig:
    name: str = ""
    release_time: Optional[datetime] = None
    toolhead: ToolheadConfig = field(default_factory=ToolheadConfig)
    wiping: WipingConfig = field(default_factory=WipingConfig)
    
    machine_max_x: float = 255
    machine_min_x: float = 0
    machine_max_y: float = 265
    machine_min_y: float = 0
    
    def get_script_path(self, version: str) -> str:
        return ""


def load_toml_config(toml_path: str) -> MKPConfig:
    if not os.path.exists(toml_path):
        raise FileNotFoundError(f"配置文件不存在: {toml_path}")
    
    with open(toml_path, 'r', encoding='utf-8') as f:
        data = toml.load(f)
    
    config = MKPConfig()
    config.name = os.path.basename(toml_path)
    
    if 'toolhead' in data:
        th = data['toolhead']
        config.toolhead = ToolheadConfig(
            speed_limit=th.get('speed_limit', 69.0),
            x_offset=th.get('offset', {}).get('x', 0.0),
            y_offset=th.get('offset', {}).get('y', 0.0),
            z_offset=th.get('offset', {}).get('z', 3.8),
            custom_mount_gcode=th.get('custom_mount_gcode', ''),
            custom_unmount_gcode=th.get('custom_unmount_gcode', '')
        )
    
    if 'wiping' in data:
        wp = data['wiping']
        config.wiping = WipingConfig(
            have_wiping_components=wp.get('have_wiping_components', False),
            wiper_x=wp.get('wiper_x', 20.0),
            wiper_y=wp.get('wiper_y', 20.0),
            wipetower_speed=wp.get('wipetower_speed', 200.0),
            nozzle_cooling_flag=wp.get('nozzle_cooling_flag', False),
            iron_apply_flag=wp.get('iron_apply_flag', False),
            user_dry_time=wp.get('user_dry_time', 0),
            force_thick_bridge_flag=wp.get('force_thick_bridge_flag', True),
            support_extrusion_multiplier=wp.get('support_extrusion_multiplier', 0.8)
        )
    
    return config


def get_preset_path(preset_name: str, presets_dir: str = "presets", printer_model: str = "") -> str:
    """获取预设文件路径
    
    Args:
        preset_name: 预设名称
        presets_dir: 预设目录
        printer_model: 打印机机型（可选）
        
    Returns:
        预设文件的完整路径
    """
    if not preset_name.endswith('.toml'):
        preset_name += '.toml'
    
    if printer_model:
        return os.path.join(presets_dir, printer_model, preset_name)
    return os.path.join(presets_dir, preset_name)


def list_available_presets(presets_dir: str = "presets") -> list:
    """列出所有可用的预设
    
    Args:
        presets_dir: 预设目录
        
    Returns:
        预设文件列表，包含机型信息
    """
    presets = []
    if not os.path.exists(presets_dir):
        return presets
    
    # 递归遍历所有目录
    for root, dirs, files in os.walk(presets_dir):
        # 跳过 history 目录
        if 'history' in root:
            continue
        
        for file in files:
            if file.endswith('.toml'):
                # 计算相对于 presets_dir 的路径
                relative_path = os.path.relpath(root, presets_dir)
                if relative_path == '.':
                    # 根目录下的预设
                    presets.append({
                        "name": file[:-5],  # 移除 .toml 后缀
                        "path": os.path.join(root, file),
                        "printer_model": ""
                    })
                else:
                    # 机型目录下的预设
                    presets.append({
                        "name": file[:-5],  # 移除 .toml 后缀
                        "path": os.path.join(root, file),
                        "printer_model": relative_path
                    })
    
    return presets
