import os

# 定义路径
html_path = os.path.join("templates", "index.html")
js_dir = os.path.join("static", "js")

# 确保存放 JS 的目录存在
os.makedirs(js_dir, exist_ok=True)

# 读取现有的 HTML
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# 1. 提取外观主题控制逻辑 (theme.js)
target_theme = '<script id="theme-manager">'
if target_theme in html:
    parts = html.split(target_theme, 1)
    before = parts[0]
    script_and_after = parts[1].split('</script>', 1)
    
    with open(os.path.join(js_dir, "theme.js"), "w", encoding="utf-8") as f:
        f.write(script_and_after[0].strip())
        
    html = before + '<script src="/static/js/theme.js"></script>' + script_and_after[1]
    print("✅ 成功剥离 theme.js (主题控制)")

# 2. 提取核心业务逻辑 (app.js)
# 定位没有属性的纯 <script> 标签
target_app = '<script>\n'
if target_app in html:
    parts = html.split(target_app, 1)
    before = parts[0]
    script_and_after = parts[1].split('</script>', 1)
    
    with open(os.path.join(js_dir, "app.js"), "w", encoding="utf-8") as f:
        f.write(script_and_after[0].strip())
        
    html = before + '<script src="/static/js/app.js"></script>' + script_and_after[1]
    print("✅ 成功剥离 app.js (业务逻辑)")

# 3. 保存瘦身后的 HTML
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

print("🎉 恭喜！index.html 瘦身大成功！")