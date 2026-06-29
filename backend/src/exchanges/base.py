"""
Abstract base class for exchange connectors.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Any


class BaseExchangeConnector(ABC):
    @abstractmethod
    def sync_all(self, start_dt: datetime, end_dt: datetime) -> List[Dict[str, Any]]:
        pass

    @property
    @abstractmethod
    def exchange_name(self) -> str:
        pass
