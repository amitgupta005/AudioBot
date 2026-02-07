import sys
import os

# Ensure backend module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.agent.graph import build_agent
from app.agent.state import AgentState

def main():
    print("Initializing AudioBot Agent...")
    agent = build_agent()
    
    conversation = []
    print("\n--- AudioBot CLI ---")
    print("Type 'exit' or 'quit' to stop.\n")

    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            
            if user_input.lower() in ["exit", "quit"]:
                print("Goodbye!")
                break

            # Prepare state using the TypedDict
            state = AgentState(
                user_input=user_input,
                conversation=conversation,
                output="",
                intent=None
            )

            # Invoke agent
            result = agent.invoke(state)

            # Update local conversation history with the result
            # The nodes append to the state['conversation'], so we take the updated list
            conversation = result["conversation"]
            
            # Print response
            print(f"Bot: {result['output']}\n")
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
