use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::{Json, ServerHandler, tool, tool_handler, tool_router};

use crate::geo::Point;
use crate::places::{self, Places, Reverse, SearchParams};
use crate::routing::{self, Route, RouteParams};
use crate::stack::Stack;

const INSTRUCTIONS: &str = "Nav Cat is a self-hosted map of one region, for planning trips with \
realistic travel times. Find places with search_places to get their coordinates. Each place \
has a link that opens it in Nav Cat, to give people. plan_route gives routes and travel times \
between points by road or path.";

#[derive(Clone)]
pub struct NavCat {
    stack: Arc<Stack>,
    tool_router: ToolRouter<Self>,
}

// Every tool only reads from this stack's own services
#[tool_router]
impl NavCat {
    pub fn new(stack: Arc<Stack>) -> Self {
        NavCat {
            stack,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        title = "Search places",
        description = "Find places by name, address or kind (\"museum\", \"cafe\"), giving their \
        coordinates, address details and an id for get_place. Pass `near` to prefer places \
        around a point.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn search_places(
        &self,
        Parameters(params): Parameters<SearchParams>,
    ) -> Result<Json<Places>, String> {
        Ok(Json(places::search(&self.stack, params).await?))
    }

    #[tool(
        title = "What's here",
        description = "The place or address at a point.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn reverse_geocode(
        &self,
        Parameters(at): Parameters<Point>,
    ) -> Result<Json<Reverse>, String> {
        Ok(Json(places::reverse(&self.stack, at).await?))
    }

    #[tool(
        title = "Plan a route",
        description = "A route by road or path through 2 to 10 waypoints in order: its \
        distance, travel time, climbing, and each leg between waypoints. Driving can avoid \
        motorways, tolls, ferries, traffic lights or small roads; walking and cycling can \
        avoid steep hills. Times are for normal speeds, without live traffic.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn plan_route(
        &self,
        Parameters(params): Parameters<RouteParams>,
    ) -> Result<Json<Route>, String> {
        Ok(Json(routing::plan_route(&self.stack, params).await?))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for NavCat {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("navcat", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}
