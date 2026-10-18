import os
import sys

# Lets tests import their shared fakes module.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "tests"))
