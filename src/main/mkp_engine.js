const fs = require('fs');

function formatXYZE(line) {
  return line.replace(/([XYEZ])([\d.]+)/g, (match, axis, val) => {
    return `${axis}${parseFloat(val).toFixed(3)}`;
  });
}

function processOffset(line, xOffset, yOffset, zOffset) {
  let processed = formatXYZE(line);
  
  processed = processed.replace(/([XYEZ])([\d.-]+)/g, (match, axis, val) => {
    let num = parseFloat(val);
    if (axis === 'X') return `X${(num + xOffset).toFixed(3)}`;
    if (axis === 'Y') return `Y${(num + yOffset).toFixed(3)}`;
    if (axis === 'Z') return `Z${(num + zOffset).toFixed(3)}`;
    return match; 
  });

  if (processed.includes('E')) {
    if (processed.includes(';')) {
      const parts = processed.split(';');
      parts[0] = parts[0].replace(/E[\d.-]+/, '').trim();
      processed = parts.join(' ;');
    } else {
      processed = processed.replace(/E[\d.-]+/, '').trim();
    }
  }
  return processed;
}

function processGcode(gcodePath, jsonPath) {
  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const config = JSON.parse(jsonContent);
    
    // 按照JSON的层级读取
    const toolhead = config.toolhead || {};
    const xOffset = toolhead.offset?.x || 0;
    const yOffset = toolhead.offset?.y || 0;
    const zOffset = toolhead.offset?.z || 0;
    const mountGcode = toolhead.custom_mount_gcode || "";
    const unmountGcode = toolhead.custom_unmount_gcode || "";
    const speedLimit = toolhead.speed_limit || 69.0;
    
    const gcodeContent = fs.readFileSync(gcodePath, 'utf8');
    const lines = gcodeContent.split('\n');
    
    const result = [];
    let isSupportInterface = false;
    let interfaceBuffer = [];
    let currentZ = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimRight();
      
      if (line.startsWith('; Z_HEIGHT:')) {
        const match = line.match(/Z_HEIGHT:\s*([\d.]+)/);
        if (match) currentZ = parseFloat(match[1]);
      }

      // 核心业务逻辑：只拦截支撑面！
      if (line.includes('; FEATURE: Support interface') || line.includes('; FEATURE: Ironing')) {
        isSupportInterface = true;
      } 
      else if (isSupportInterface && line.startsWith('; FEATURE:') && !line.includes('Support interface')) {
        isSupportInterface = false;
        
        if (interfaceBuffer.length > 0) {
          result.push('; ===== MKP Support Electron Glueing Start =====');
          result.push('M106 S255 ; 开启风扇吹干');
          result.push(`G1 Z${(currentZ + zOffset + 3).toFixed(3)} ; 抬起防撞`);
          result.push(mountGcode.trim()); // 执行JSON里的装笔动作
          result.push(`G1 F${Math.floor(speedLimit * 60)}`);
          
          for (const iLine of interfaceBuffer) {
            if (iLine.startsWith('G1 ') && (iLine.includes('X') || iLine.includes('Y'))) {
               result.push(processOffset(iLine, xOffset, yOffset, zOffset));
            }
          }
          
          result.push(unmountGcode.trim()); // 执行卸载笔动作
          result.push(`G1 Z${currentZ.toFixed(3)} ; 恢复高度`);
          result.push('; ===== MKP Support Electron Glueing End =====');
          
          interfaceBuffer = [];
        }
      }

      result.push(line);

      if (isSupportInterface && !line.startsWith(';')) {
        interfaceBuffer.push(line);
      }
    }

    return result.join('\n');
  } catch (error) {
    console.error("Gcode解析引擎严重错误:", error);
    throw error;
  }
}

module.exports = { processGcode };
