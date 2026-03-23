from pydantic import BaseModel, Field
from typing import Literal


class IntentResponse(BaseModel):
    intent: Literal["chat", "clarify"] = Field(
        description="The classified intent of the user input."
    )
