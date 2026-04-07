from __future__ import annotations

from sqlalchemy.orm import selectinload

from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.jobs import Job
from app.models.users import User


# Async-safe relationship loaders. Pair these with explicit SELECTs so
# relationship access never triggers hidden lazy I/O.
USER_WITH_JOBS = (
    selectinload(User.jobs),
)

USER_WITH_CANDIDATES = (
    selectinload(User.candidates),
)

JOB_WITH_COMPANY = (
    selectinload(Job.company),
)

JOB_WITH_CANDIDATES = (
    selectinload(Job.candidates),
)

JOB_WITH_INTERVIEWS = (
    selectinload(Job.interviews),
)

JOB_FULL_GRAPH = (
    selectinload(Job.company),
    selectinload(Job.candidates).selectinload(Candidate.user),
    selectinload(Job.candidates).selectinload(Candidate.interviews),
    selectinload(Job.interviews).selectinload(Interview.candidate),
)

CANDIDATE_WITH_USER = (
    selectinload(Candidate.user),
)

CANDIDATE_WITH_JOB = (
    selectinload(Candidate.job),
)

CANDIDATE_WITH_INTERVIEWS = (
    selectinload(Candidate.interviews),
)

CANDIDATE_FULL_GRAPH = (
    selectinload(Candidate.user),
    selectinload(Candidate.job).selectinload(Job.company),
    selectinload(Candidate.interviews).selectinload(Interview.job),
)

INTERVIEW_WITH_CANDIDATE = (
    selectinload(Interview.candidate),
)

INTERVIEW_WITH_JOB = (
    selectinload(Interview.job),
)

INTERVIEW_FULL_GRAPH = (
    selectinload(Interview.candidate).selectinload(Candidate.user),
    selectinload(Interview.job).selectinload(Job.company),
)
