from pydantic import BaseModel, Field
from typing import Dict, Optional, Literal

class InterviewAnalysis(BaseModel):
    relevance: str = Field(description="Evaluation of relevance to the question")
    depth: str = Field(description="Evaluation of depth of knowledge")
    practical_experience: str = Field(description="Evaluation of practical experience")
    communication_clarity: str = Field(description="Evaluation of communication clarity")
    suitability: str = Field(description="Evaluation of suitability for the role")

class InterviewResponse(BaseModel):
    acknowledgement: str = Field(description="Exactly one line acknowledging the candidate's last response. Start with a neutral or professional acknowledgement.")
    next_question: str = Field(description="A follow-up or new question based on the job description. If there is nothing to follow up, ask a new question based on the job description.")
    analysis: InterviewAnalysis = Field(description="Internal evaluation of the candidate's response.")

class IntentResponse(BaseModel):
    intent: Literal["chat", "tool", "clarify"] = Field(description="The classified intent of the user input.")
