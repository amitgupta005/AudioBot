# backend/app/agent/graph.py

from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.agent.nodes import (
    intent_classifier_node,
    chat_node,
    tool_node,
    clarify_node,
)


def route_by_intent(state: AgentState) -> str:
    intent = state.get("intent")

    if intent == "tool":
        return "tool"
    elif intent == "clarify":
        return "clarify"
    else:
        return "chat"


def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("intent_classifier", intent_classifier_node)
    graph.add_node("chat", chat_node)
    graph.add_node("tool", tool_node)
    graph.add_node("clarify", clarify_node)

    graph.set_entry_point("intent_classifier")

    graph.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "chat": "chat",
            "tool": "tool",
            "clarify": "clarify",
        },
    )

    graph.add_edge("chat", END)
    graph.add_edge("tool", END)
    graph.add_edge("clarify", END)

    return graph.compile()
