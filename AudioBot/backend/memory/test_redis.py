import redis
import sys

def test_connection():
    try:
        r = redis.Redis(host='localhost', port=6379, db=0, socket_timeout=2)
        r.ping()
        print("SUCCESS: Connected to Redis!")
    except redis.exceptions.ConnectionError:
        print("FAILURE: Could not connect to Redis at localhost:6379.")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_connection()
