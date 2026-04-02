from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.redis import RedisSaver
from app.agent.state import AgentState
from app.agent.nodes import (
    ask_question_node,
    close_interview_node,
    intent_classifier_node,
    clarify_node,
    interview_evaluator_node,
    report_generator_node,
)
from app.config import REDIS_URL

redis_saver = RedisSaver(redis_url=REDIS_URL)
redis_saver.setup()


def route_by_intent(state: AgentState) -> str:
    intent = state.get("intent")

    if intent == "clarify":
        return "clarify"
    elif intent == "chat":
        return "interview_evaluator"
    else:
        return "END"


def route_interview(state: AgentState) -> str:
    if state.get("interview_complete"):
        return "close_interview"
    return "ask_question"


def build_agent():
    graph = StateGraph(AgentState)

    graph.add_node("intent_classifier", intent_classifier_node)
    graph.add_node("clarify", clarify_node)
    graph.add_node("interview_evaluator", interview_evaluator_node)
    graph.add_node("ask_question", ask_question_node)
    graph.add_node("close_interview", close_interview_node)
    graph.add_node("report_generator", report_generator_node)

    # graph.set_entry_point("intent_classifier")
    graph.add_edge(START, "intent_classifier")

    graph.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "interview_evaluator": "interview_evaluator",
            "clarify": "clarify",
            "END": END,
        },
    )

    graph.add_conditional_edges(
        "interview_evaluator",
        route_interview,
        {
            "ask_question": "ask_question",
            "close_interview": "close_interview",
        },
    )

    graph.add_edge("ask_question", END)
    graph.add_edge("close_interview", "report_generator")
    graph.add_edge("report_generator", END)
    graph.add_edge("clarify", END)

    return graph.compile(checkpointer=redis_saver)
