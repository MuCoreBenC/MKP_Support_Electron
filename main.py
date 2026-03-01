from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import uvicorn

# 实例化一个牛逼的 FastAPI 应用
app = FastAPI(title="MKP Support")

# 挂载静态文件夹 (以后你的图标、图片全从这里拿)
app.mount("/static", StaticFiles(directory="static"), name="static")

# 指定模板文件夹 (刚才挪进去的 index.html 就在这)
templates = Jinja2Templates(directory="templates")

# 写一个路由，当有人访问主页 "/" 时，就把网页扔给他
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# 启动服务器的咒语
if __name__ == "__main__":
    # reload=True 意味着你以后改了代码，它会自动热更新，不用频繁重启！
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
