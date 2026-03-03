import sys
import os

# Ensure backend module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.agent.graph import build_agent
from app.agent.state import AgentState
from app.config import DEFAULT_SYSTEM_PROMPT

def test_single_turn():
    print("Initializing Agent for verification...")
    agent = build_agent()
    
    user_input = "Hello! My name is Amit and I'm interested in the Software Engineer position."
    
    state = AgentState(
        user_input=user_input,
        conversation=[],
        system_message=DEFAULT_SYSTEM_PROMPT,
        output="",
        intent=None
    )
    
    print(f"Sending input: {user_input}")
    try:
        result = agent.invoke(state)
        print("\n--- Agent Response ---")
        print(f"Intent: {result['intent']}")
        print(f"Output: {result['output']}")
        print("\nVerification successful!")
    except Exception as e:
        print(f"\nVerification failed: {e}")

if __name__ == "__main__":
    test_single_turn()
