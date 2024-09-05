import asyncio
import websockets
from mousekey import MouseKey
import time

from threading import Thread

VERSION = "0.1.0"

mkey = MouseKey()
new_x, new_y = mkey.get_cursor_position()

screen_width, screen_height = mkey.get_screen_resolution()
kill_thread = False

def move_mouse():
    global new_x, new_y

    cur_x, cur_y = mkey.get_cursor_position()
    delta_x, delta_y = new_x - cur_x, new_y - cur_y
    move_x, move_y = delta_x * 0.05, delta_y * 0.05

    # print("CURSOR", cur_x, cur_y, "NEW", new_x, new_y, "DELTA", delta_x, delta_y)

    if (abs(delta_x) < 6 and abs(delta_y) < 6 or new_x == -1 or new_y == -1):
        new_x, new_y = -1, -1
        return

    try:
        mkey.move_to(cur_x + move_x, cur_y + move_y)
    except:
        pass

def clamp(val, min_val, max_val):
    #print(val, min_val, max_val)
    return min(max(val, min_val), max_val)

async def handle_connection(websocket, path):
    global new_x, new_y

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

            #print(method, data)
            
            if (method == "move"):
                x, y = data.split(",")
                if (x == "0" and y == "0"):
                    continue

                multiplier_x, multiplier_y = 3, 4

                cur_x, cur_y = mkey.get_cursor_position()
                move_x, move_y = float(x) * multiplier_x, float(y) * multiplier_y
                #print("MOVE", x, y)
                
                if (new_x != -1 or new_y != -1):
                    cur_x, cur_y = new_x, new_y

                new_x = clamp(cur_x + move_x, 0, screen_width)
                new_y = clamp(cur_y + move_y, 0, screen_height)

            if (method == "version"):
                await websocket.send(f"Presentation-Agent/{VERSION}")

            if (method == "ping"):
                await websocket.send(data)
        
    except websockets.exceptions.ConnectionClosed:
        pass

def sync_mouse():
    while not kill_thread:
        move_mouse()
        time.sleep(0.01)

if __name__ == "__main__":
    start_server = websockets.serve(handle_connection, "localhost", 8765)

    thread = Thread(target=sync_mouse)
    thread.start()

    try:
        print("Starting server")
        asyncio.get_event_loop().run_until_complete(start_server)
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        kill_thread = True

    thread.join()
