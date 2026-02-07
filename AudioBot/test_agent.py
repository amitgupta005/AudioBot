import asyncio
import websockets
import json
import sys

async def test_agent():
    uri = "ws://localhost:8000/ws"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket")
            
            # Test 1: Chat Intent
            print("\nTest 1: Sending 'Hello'")
            await websocket.send("Hello")
            response = await websocket.recv()
            print(f"Received: {response}")
            
            # Test 2: Tool Intent
            print("\nTest 2: Sending 'What time is it?'")
            await websocket.send("What time is it?")
            response = await websocket.recv()
            print(f"Received: {response}")
            
            if "current time is" in response:
                print("\nSUCCESS: Tool intent verified.")
            else:
                print("\nFAILURE: Tool intent did not trigger expected response.")
                
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_agent())
