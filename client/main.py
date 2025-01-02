import asyncio
from websockets.server import serve
from websockets.exceptions import ConnectionClosed
from mousekey import MouseKey
import time

from threading import Thread

VERSION = "0.1.0"

mkey = MouseKey()
new_x, new_y = mkey.get_cursor_position()

screen_width, screen_height = mkey.get_screen_resolution()
kill_thread = False

last_delta_x, last_delta_y = 0, 0
ticks_since_last_move = 0

def move_mouse():
    global new_x, new_y, last_delta_x, last_delta_y, ticks_since_last_move

    cur_x, cur_y = mkey.get_cursor_position()
    delta_x, delta_y = new_x - cur_x, new_y - cur_y
    multi_x, multi_y = min(abs(delta_x) / screen_width, 0.65), min(abs(delta_y) / screen_height, 0.65)
    move_x, move_y = delta_x * multi_x, delta_y * multi_y

    # print("CURSOR", cur_x, cur_y, "NEW", new_x, new_y, "DELTA", delta_x, delta_y, "MOVE", move_x, move_y)

    if (abs(move_x) < 2 and abs(move_y) < 2 and abs(delta_x) > 0 and abs(delta_y) > 0):
        move_x, move_y = delta_x * 0.2, delta_y * 0.2

        # make sure move_x and move_y are at least 1 or -1 if not 0

        if (move_x != 0 and abs(move_x) < 1):
            move_x = 1 if delta_x > 0 else -1

        if (move_y != 0 and abs(move_y) < 1):
            move_y = 1 if delta_y > 0 else -1

    if (last_delta_x == delta_x and last_delta_y == delta_y):
        ticks_since_last_move += 1

    last_delta_x, last_delta_y = delta_x, delta_y

    if (abs(delta_x) < 4 and abs(delta_y) < 4 or new_x == -1 or new_y == -1 or ticks_since_last_move > 5):
        ticks_since_last_move = 0
        new_x, new_y = -1, -1
        return

    print("DETLA", int(delta_x), int(delta_y), abs(delta_x) < 10, abs(delta_y) < 10, new_x == -1, new_y == -1)

    try:
        mkey.move_to(cur_x + move_x, cur_y + move_y)
    except:
        pass

def clamp(val, min_val, max_val):
    #print(val, min_val, max_val)
    return min(max(val, min_val), max_val)

connections_count = 0
main_connection = None

async def handle_connection(websocket, path):
    global new_x, new_y, connections_count, main_connection

    if (connections_count > 1):
        await websocket.send("Another connection is already active")
        await websocket.close()
        print("Another connection is already active")
        main_connection.close()
        connections_count = 0
        return
    
    print("Connected")

    main_connection = websocket
    connections_count += 1


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

                multiplier_x, multiplier_y = 1, 1

                cur_x, cur_y = mkey.get_cursor_position()
                move_x, move_y = float(x) * multiplier_x, float(y) * multiplier_y
                #print("MOVE", x, y)
                
                if (new_x != -1 or new_y != -1):
                    cur_x, cur_y = new_x, new_y

                new_x = clamp(cur_x + move_x, 0, screen_width)
                new_y = clamp(cur_y + move_y, 0, screen_height)
            
            if (method == "move_to"):
                x, y = data.split(",")
                if (x == "0" and y == "0"):
                    continue

                print("MOVE TO", x, y)
                
                new_x = clamp(float(x), 0, screen_width)
                new_y = clamp(float(y), 0, screen_height)

            if (method == "version"):
                await websocket.send(f"Presentation-Agent/{VERSION}/{screen_width}x{screen_height}")

            if (method == "ping"):
                await websocket.send(data)
        
    except ConnectionClosed:
        pass

def sync_mouse():
    while not kill_thread:
        move_mouse()
        time.sleep(0.005)

if __name__ == "__main__":
    start_server = serve(handle_connection, "localhost", 30201)

    thread = Thread(target=sync_mouse)
    thread.start()

    try:
        print("Listening on :30201")
        asyncio.get_event_loop().run_until_complete(start_server)
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        kill_thread = True

    thread.join()
