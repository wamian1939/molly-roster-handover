import os

# Synthetic stores remain available only inside the isolated automated test process.
os.environ["SCHEDULING_LAB_TEST_MOCK"] = "1"
