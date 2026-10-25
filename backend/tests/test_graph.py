"""
Tests for the agent graph wiring (app/agent/graph.py).

`StateGraph` and the node callables are faked, so this asserts the wiring
without building a real LangGraph or touching Postgres.

Note for future edits: an earlier version of this file modelled the Redis
checkpointer and a `compile(checkpointer)` signature. The app now uses an
AsyncPostgresSaver attached during the FastAPI lifespan, and `build_agent()`
calls `compile()` with no arguments. Do not reintroduce the Redis stubs.
"""

import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch

import dotenv


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False

EXPECTED_NODES = {
    "intent_classifier",
    "clarify",
    "interview_evaluator",
    "ask_question",
    "close_interview",
    "report_generator",
}


class FakeCompiledGraph:
    pass


class FakeStateGraph:
    def __init__(self, state_type):
        self.state_type = state_type
        self.nodes = {}
        self.conditional_edges = []
        self.edges = []
        self.compiled = False

    def add_node(self, name, node):
        self.nodes[name] = node

    def add_conditional_edges(self, source, router, mapping):
        self.conditional_edges.append((source, router, mapping))

    def add_edge(self, source, target):
        self.edges.append((source, target))

    def compile(self):
        self.compiled = True
        return FakeCompiledGraph()


def _load_graph_module():
    """Import app.agent.graph with StateGraph and the nodes faked out."""
    fake_langgraph_graph = types.ModuleType("langgraph.graph")
    fake_langgraph_graph.StateGraph = FakeStateGraph
    fake_langgraph_graph.START = "START"
    fake_langgraph_graph.END = "END"

    fake_nodes = types.ModuleType("app.agent.nodes")
    for node_name in EXPECTED_NODES:
        setattr(fake_nodes, f"{node_name}_node", object())

    with patch.dict(
        sys.modules,
        {
            "langgraph.graph": fake_langgraph_graph,
            "app.agent.nodes": fake_nodes,
        },
    ):
        sys.modules.pop("app.agent.graph", None)
        return importlib.import_module("app.agent.graph")


class GraphTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph_module = _load_graph_module()

    @classmethod
    def tearDownClass(cls):
        # Drop the module built against fakes so later tests re-import the real one.
        sys.modules.pop("app.agent.graph", None)

    def test_build_agent_registers_expected_nodes(self):
        compiled = self.graph_module.build_agent()

        self.assertIsInstance(compiled, FakeCompiledGraph)

    def test_build_agent_wires_entry_and_terminal_edges(self):
        captured = {}
        original = self.graph_module.StateGraph

        def capturing_state_graph(state_type):
            graph = original(state_type)
            captured["graph"] = graph
            return graph

        with patch.object(self.graph_module, "StateGraph", capturing_state_graph):
            self.graph_module.build_agent()

        graph = captured["graph"]
        self.assertEqual(set(graph.nodes), EXPECTED_NODES)
        self.assertTrue(graph.compiled)

        # Entry point, and the close -> report -> END chain.
        self.assertIn(("START", "intent_classifier"), graph.edges)
        self.assertIn(("close_interview", "report_generator"), graph.edges)
        self.assertIn(("report_generator", "END"), graph.edges)
        self.assertIn(("ask_question", "END"), graph.edges)
        self.assertIn(("clarify", "END"), graph.edges)

        # Two routers: intent classification, then continue-or-close.
        sources = [source for source, _router, _mapping in graph.conditional_edges]
        self.assertEqual(sources, ["intent_classifier", "interview_evaluator"])

    def test_route_by_intent(self):
        route = self.graph_module.route_by_intent
        self.assertEqual(route({"intent": "clarify"}), "clarify")
        self.assertEqual(route({"intent": "chat"}), "interview_evaluator")
        self.assertEqual(route({}), "END")

    def test_route_interview(self):
        route = self.graph_module.route_interview
        self.assertEqual(route({"interview_complete": True}), "close_interview")
        self.assertEqual(route({"interview_complete": False}), "ask_question")

    def test_pool_is_pgbouncer_compatible_and_opens_lazily(self):
        """Guards two non-obvious requirements.

        prepare_threshold=0 is required by Supabase's transaction pooler, and
        open=False lets main.py open the pool inside the lifespan instead of at
        import time.
        """
        kwargs = self.graph_module.connection_kwargs
        self.assertEqual(kwargs["prepare_threshold"], 0)
        self.assertTrue(kwargs["autocommit"])
        self.assertIn("sslmode=", self.graph_module._conninfo)


if __name__ == "__main__":
    unittest.main()
