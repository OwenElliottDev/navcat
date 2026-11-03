// Prompts people pick (e.g. as slash commands) to have the model plan with the tools, and
// completion of their mode and category arguments from what the stack has

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CompleteRequestParams, CompleteResult, CompletionInfo, PromptMessage, Reference, Role,
};
use rmcp::{prompt, prompt_router};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::browse;
use crate::capabilities;
use crate::server::NavCat;
use crate::stack::Stack;

#[derive(Deserialize, JsonSchema)]
pub struct DayTripArgs {
    /// Where the day starts: an address or place name
    pub start: String,
    /// Places or kinds of place to fit in, e.g. "the museum, lunch somewhere, a park"
    pub stops: String,
    /// The day, e.g. 2026-10-24
    pub date: String,
    /// How to get around: a travel mode such as "foot", "bike" or "car", or "transit" for
    /// public transport and walking (the default)
    pub mode: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct GetThereArgs {
    /// Where from: an address or place name
    pub from: String,
    /// Where to
    pub to: String,
    /// When to leave, e.g. "2026-10-24 08:30"; now by default
    pub depart_at: Option<String>,
    /// When to arrive by, instead of when to leave
    pub arrive_by: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct NearbyArgs {
    /// Where: an address or place name
    pub from: String,
    /// A kind of place, e.g. "cafe" or "pharmacy"
    pub category: String,
    /// How many minutes away at most (default 10)
    pub minutes: Option<String>,
    /// How to get there: "foot" (the default), "bike" or "car"
    pub mode: Option<String>,
}

fn user(text: String) -> Vec<PromptMessage> {
    vec![PromptMessage::new_text(Role::User, text)]
}

#[prompt_router(vis = "pub(crate)")]
impl NavCat {
    #[prompt(
        title = "Plan a day trip",
        description = "An itinerary for a day out: the stops in a sensible order, open when \
        you get there, with travel between them."
    )]
    async fn plan_day_trip(&self, Parameters(args): Parameters<DayTripArgs>) -> Vec<PromptMessage> {
        let mode = args.mode.as_deref().unwrap_or("transit");
        user(format!(
            "Plan a day trip on {date} starting from {start}, taking in: {stops}. Get around by \
            {mode}.\n\n\
            Use the Nav Cat tools:\n\
            1. capabilities: the travel modes, and for public transport that {date} is within \
            the timetables.\n\
            2. search_places (or find_nearby for a kind of place) to find {start} and each \
            stop, and get_place for their opening_hours.\n\
            3. travel_times between the stops to choose a sensible order, and only visit places \
            when they're open.\n\
            4. plan_route or plan_transit for each leg, at the time you'd set off.\n\n\
            Give an itinerary with the time at each stop, how to get between them and how \
            long that takes, and each place's link.",
            date = args.date,
            start = args.start,
            stops = args.stops,
        ))
    }

    #[prompt(
        title = "How to get there",
        description = "Compare walking, cycling, driving and public transport for a trip."
    )]
    async fn get_there(&self, Parameters(args): Parameters<GetThereArgs>) -> Vec<PromptMessage> {
        let when = match (&args.depart_at, &args.arrive_by) {
            (_, Some(by)) => format!("arriving by {by}"),
            (Some(at), None) => format!("leaving at {at}"),
            (None, None) => "leaving now".into(),
        };
        user(format!(
            "How should I get from {from} to {to}, {when}?\n\n\
            Use the Nav Cat tools: search_places to find both places, capabilities for the \
            travel modes, then plan_route for walking, \
            cycling and driving and plan_transit for public transport. Compare how long each \
            takes (and for public transport, when it leaves and arrives and the changes), and \
            recommend one.",
            from = args.from,
            to = args.to,
        ))
    }

    #[prompt(
        title = "What's nearby",
        description = "Places of a kind within a few minutes of somewhere."
    )]
    async fn whats_nearby(&self, Parameters(args): Parameters<NearbyArgs>) -> Vec<PromptMessage> {
        let minutes = args.minutes.as_deref().unwrap_or("10");
        let mode = args.mode.as_deref().unwrap_or("foot");
        user(format!(
            "What {category} places are within {minutes} minutes of {from} by {mode}?\n\n\
            Use the Nav Cat tools: search_places to find {from}, list_categories for the \
            category matching \"{category}\", then reachable. Use get_place for the closest \
            few to say whether they're open now. List them nearest first with their links.",
            category = args.category,
            from = args.from,
        ))
    }
}

/// Values for a prompt's mode or category argument starting with what's typed
pub async fn complete(stack: &Stack, request: CompleteRequestParams) -> CompleteResult {
    let Reference::Prompt(_) = request.r#ref else {
        return CompleteResult::default();
    };
    let typed = request.argument.value.to_lowercase();
    let options: Vec<String> = match request.argument.name.as_str() {
        "mode" => capabilities::fetch(stack)
            .await
            .ok()
            .and_then(|found| found.routing)
            .map(|routing| {
                routing
                    .profiles
                    .into_iter()
                    .chain(["transit".into()])
                    .collect()
            })
            .unwrap_or_default(),
        "category" => browse::categories(stack)
            .await
            .map(|found| {
                let ids = found.categories.into_iter();
                ids.filter_map(|c| c.get("id")?.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    };
    let mut values: Vec<String> = options
        .into_iter()
        .filter(|o| o.to_lowercase().starts_with(&typed))
        .collect();
    values.truncate(CompletionInfo::MAX_VALUES);
    CompleteResult::new(CompletionInfo::with_all_values(values).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    #[test]
    fn lists_prompts() {
        let prompts = NavCat::prompt_router().list_all();
        let names: Vec<&str> = prompts.iter().map(|p| p.name.as_ref()).collect();
        assert_eq!(names.len(), 3);
        for name in ["plan_day_trip", "get_there", "whats_nearby"] {
            assert!(names.contains(&name), "{name}");
        }
        let trip = prompts.iter().find(|p| p.name == "plan_day_trip").unwrap();
        let required: Vec<_> = trip
            .arguments
            .iter()
            .flatten()
            .filter(|a| a.required == Some(true))
            .map(|a| a.name.as_str())
            .collect();
        assert_eq!(required, ["start", "stops", "date"]);
    }

    // Completes nothing for other arguments, without asking any service
    #[tokio::test]
    async fn completes_only_mode_and_category() {
        use rmcp::model::ArgumentInfo;
        let stack = Stack::new(&Config::from_env().unwrap());
        let request = CompleteRequestParams::new(
            Reference::for_prompt("get_there"),
            ArgumentInfo::new("from", "Fli"),
        );
        assert!(complete(&stack, request).await.completion.values.is_empty());
    }
}
