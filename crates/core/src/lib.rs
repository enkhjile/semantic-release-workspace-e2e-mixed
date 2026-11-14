pub fn value() -> u32 { 42 }

#[must_use = "consume cycle readiness"]
pub fn cycle_ready() -> bool { true }
