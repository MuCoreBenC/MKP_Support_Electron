const Logger = {
  _format(level, message, data) {
    const extra = data ? ` | 附加数据: ${JSON.stringify(data)}` : '';
    const payload = `[${level}] ${message}${extra}`;

    if (level === 'ERROR') {
      console.error(payload);
    } else if (level === 'WARN') {
      console.warn(payload);
    } else {
      console.log(payload);
    }

    if (window.mkpAPI && typeof window.mkpAPI.writeLog === 'function') {
      window.mkpAPI.writeLog(payload);
    }
  },
  info(message, data) {
    Logger._format('INFO', message, data);
  },
  warn(message, data) {
    Logger._format('WARN', message, data);
  },
  error(message, data) {
    Logger._format('ERROR', message, data);
  }
};

window.Logger = Logger;
