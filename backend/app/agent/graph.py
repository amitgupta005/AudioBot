from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.redis import RedisSaver
from app.agent.state import AgentState
from app.agent.nodes import (
    intent_classifier_node,
    chat_node,
    clarify_node,
)
from app.config import REDIS_URL

redis_saver = RedisSaver(redis_url=REDIS_URL)
redis_saver.setup()


def route_by_intent(state: AgentState) -> str:
    intent = state.get("intent")

    if intent == "clarify":
        return "clarify"
    else:
        return "chat"


def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("intent_classifier", intent_classifier_node)
    graph.add_node("chat", chat_node)
    graph.add_node("clarify", clarify_node)

    graph.set_entry_point("intent_classifier")

    graph.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "chat": "chat",
            "clarify": "clarify",
        },
    )

    graph.add_edge("chat", END)
    graph.add_edge("clarify", END)

    return graph.compile(checkpointer=redis_saver)
