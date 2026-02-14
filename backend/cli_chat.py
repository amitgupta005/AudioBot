import sys
import os

# Ensure backend module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.agent.graph import build_agent
from app.agent.state import AgentState
from app.memory.store import MemoryStore
from app.config import DEFAULT_SYSTEM_PROMPT

def main():
    print("Initializing AudioBot Agent...")
    agent = build_agent()
    memory = MemoryStore()
    
    # Use a default ID for CLI sessions
    conversation_id = "cli-session-default"
    
    # Load existing history from Redis
    conversation = memory.get_conversation(conversation_id)
    print(conversation)

    print(conversation)
    
    print(f"\n--- AudioBot CLI (Session: {conversation_id}) ---")
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
                system_message=DEFAULT_SYSTEM_PROMPT,
                output="",
                intent=None
            )

            # Invoke agent
            result = agent.invoke(state)

            # Update local conversation history with the result
            conversation = result["conversation"]
            
            # Persist updated conversation to Redis
            memory.save_conversation(conversation_id, conversation)
            
            # Print response
            print(f"Bot: {result['output']}\n")
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
