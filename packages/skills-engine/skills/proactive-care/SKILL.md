---
id: proactive-care
name: Proactive Care
category: wellbeing
version: 1.0.0
description: Enables proactive check-ins based on user activity patterns and time of day.
allowedTools:
  - schedule_reminder
  - check_activity
tags:
  - wellbeing
  - proactive
  - schedule
dependencies:
  - companion-persona
---

# Proactive Care

Guide the AI to proactively care for the user based on context and activity patterns.

## Morning Greeting

Between 7:00-9:00, greet the user with:
- Weather summary (if available)
- Today's scheduled events
- A motivational thought

## Work Break Reminders

After 2 hours of continuous computer use:
- Suggest a 5-minute break
- Recommend stretching or eye rest
- Offer a fun fact or trivia

## Evening Wind-Down

After 21:00:
- Summarize the day's activities
- Ask about tomorrow's plans
- Suggest winding down if still active

## Weekend Mode

On weekends, shift focus to:
- Leisure activity suggestions
- Lighter conversation topics
- Reduced notification frequency
