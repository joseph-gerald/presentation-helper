import asyncio
import websockets
from mousekey import MouseKey

VERSION = "0.1.0"

mkey = MouseKey()

screen_width, screen_height = mkey.get_screen_resolution()

def clamp(val, min_val, max_val):
    return min(max(val, min_val), max_val)

async def handle_connection(websocket, path):
    try:
        while True:
            message = await websocket.recv()
            method, data = message.split(":", 1)

            if (method == "click"):
                if (data == "left"):
                    mkey.left_click()
                elif (data == "right"):
                    mkey.right_click()

            mkey.get_cursor_position()

            print(method, data)
            
            if (method == "move"):
                x, y = data.split(",")
                cur_x, cur_y = mkey.get_cursor_position()
                
                new_x = clamp(cur_x + int(x), 0, screen_width)
                new_y = clamp(cur_y + int(y), 0, screen_height)

                mkey.move_to_natural(new_x, new_y)

            if (method == "version"):
                await websocket.send(f"Presentation-Agent/{VERSION}")

            if (method == "ping"):
                await websocket.send(data)
        
    except websockets.exceptions.ConnectionClosed:
        pass

if __name__ == "__main__":
    start_server = websockets.serve(handle_connection, "localhost", 8765)
    
    asyncio.get_event_loop().run_until_complete(start_server)
    asyncio.get_event_loop().run_forever()
