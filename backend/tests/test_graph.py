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


class FakeCompiledGraph:
    def __init__(self, checkpointer):
        self.checkpointer = checkpointer


class FakeStateGraph:
    def __init__(self, state_type):
        self.state_type = state_type
        self.nodes = {}
        self.entry_point = None
        self.conditional_edges = None
        self.edges = []

    def add_node(self, name, node):
        self.nodes[name] = node

    def set_entry_point(self, name):
        self.entry_point = name

    def add_conditional_edges(self, source, router, mapping):
        self.conditional_edges = (source, router, mapping)

    def add_edge(self, source, target):
        self.edges.append((source, target))

    def compile(self, checkpointer):
        return FakeCompiledGraph(checkpointer)


class FakeRedisSaver:
    def __init__(self, redis_url):
        self.redis_url = redis_url
        self.setup_called = False

    def setup(self):
        self.setup_called = True


class GraphTests(unittest.TestCase):
    def test_build_agent_wires_expected_graph(self):
        fake_langgraph_graph = types.ModuleType("langgraph.graph")
        fake_langgraph_graph.StateGraph = FakeStateGraph
        fake_langgraph_graph.START = "START"
        fake_langgraph_graph.END = "END"

        fake_langgraph_checkpoint_redis = types.ModuleType("langgraph.checkpoint.redis")
        fake_langgraph_checkpoint_redis.RedisSaver = FakeRedisSaver

        fake_nodes = types.ModuleType("app.agent.nodes")
        fake_nodes.intent_classifier_node = object()
        fake_nodes.clarify_node = object()
        fake_nodes.interview_evaluator_node = object()
        fake_nodes.ask_question_node = object()
        fake_nodes.close_interview_node = object()
        fake_nodes.report_generator_node = object()

        with patch.dict(
            sys.modules,
            {
                "langgraph.graph": fake_langgraph_graph,
                "langgraph.checkpoint.redis": fake_langgraph_checkpoint_redis,
                "app.agent.nodes": fake_nodes,
            },
        ):
            sys.modules.pop("app.agent.graph", None)
            graph_module = importlib.import_module("app.agent.graph")

        compiled = graph_module.build_agent()
        self.assertIsInstance(compiled, FakeCompiledGraph)
        self.assertEqual(graph_module.redis_saver.redis_url, graph_module.REDIS_URL)
        self.assertTrue(graph_module.redis_saver.setup_called)
        self.assertEqual(graph_module.route_by_intent({"intent": "clarify"}), "clarify")
        self.assertEqual(graph_module.route_by_intent({"intent": "chat"}), "interview_evaluator")
        self.assertEqual(graph_module.route_by_intent({}), "interview_evaluator")
        self.assertEqual(graph_module.route_interview({"interview_complete": True}), "close_interview")
        self.assertEqual(graph_module.route_interview({"interview_complete": False}), "ask_question")


if __name__ == "__main__":
    unittest.main()
