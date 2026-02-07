from langchain_community.llms import Ollama

try:
    llm = Ollama(model="mistral")
    print("Sending prompt to Ollama...")
    response = llm.invoke("Hello")
    print(f"Response type: {type(response)}")
    print(f"Response content: '{response}'")
except Exception as e:
    print(f"Error: {e}")
