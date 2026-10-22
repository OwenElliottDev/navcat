use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::{Json, ServerHandler, tool, tool_handler, tool_router};

use crate::browse::{self, Categories, Nearby, NearbyParams, PlaceParams};
use crate::capabilities::{self, Capabilities};
use crate::geo::Point;
use crate::places::Place;
use crate::places::{self, Places, Reverse, SearchParams};
use crate::routing::{self, Route, RouteParams};
use crate::stack::Stack;
use crate::transit::{self, Journeys, TransitParams};

const INSTRUCTIONS: &str = "Nav Cat is a self-hosted map of one region, for planning trips with \
realistic travel times. capabilities says what it covers: the area, travel modes, and the \
public transport timetables' modes, dates and time zone. Find places with search_places to get their coordinates. Each place \
has a link that opens it in Nav Cat, to give people. plan_route gives routes and travel times \
between points by road or path, and plan_transit public transport journeys from the timetables. \
Give times with their UTC offset. get_place gives a place's details such as opening hours; \
find_nearby finds places of a kind (list_categories) around a point.";

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

    #[tool(
        title = "Plan a public transport journey",
        description = "Public transport journeys between two points from the timetables, \
        leaving at or arriving by a time: each walk and ride with its route, headsign, stops \
        and times. Timetables only cover some areas and dates (see capabilities).",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn plan_transit(
        &self,
        Parameters(params): Parameters<TransitParams>,
    ) -> Result<Json<Journeys>, String> {
        Ok(Json(transit::plan(&self.stack, params).await?))
    }

    #[tool(
        title = "Place details",
        description = "Everything known about a place by its id: its OSM tags such as \
        opening_hours, phone, website and address.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_place(
        &self,
        Parameters(params): Parameters<PlaceParams>,
    ) -> Result<Json<Place>, String> {
        Ok(Json(browse::get_place(&self.stack, &params.id).await?))
    }

    #[tool(
        title = "What Nav Cat covers",
        description = "The area this server covers, its travel modes and route options, and its \
        public transport: modes, the dates its timetables run and their time zone.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn capabilities(&self) -> Result<Json<Capabilities>, String> {
        Ok(Json(capabilities::capabilities(&self.stack).await?))
    }

    #[tool(
        title = "Place categories",
        description = "The kinds of place find_nearby can look for, e.g. cafes, pharmacies, \
        toilets.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_categories(&self) -> Result<Json<Categories>, String> {
        Ok(Json(browse::categories(&self.stack).await?))
    }

    #[tool(
        title = "Find nearby",
        description = "Places of a category within a distance of a point, nearest first.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn find_nearby(
        &self,
        Parameters(params): Parameters<NearbyParams>,
    ) -> Result<Json<Nearby>, String> {
        Ok(Json(browse::nearby(&self.stack, params).await?))
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
