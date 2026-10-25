use std::sync::Arc;

use rmcp::handler::server::router::prompt::PromptRouter;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CompleteRequestParams, CompleteResult, Implementation, ListResourceTemplatesResult,
    ListResourcesResult, PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse,
    ServerCapabilities, ServerConfig, ToolAnnotations,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer};
use rmcp::{Json, ServerHandler, prompt_handler, tool, tool_handler, tool_router};

use crate::browse::{self, Categories, Nearby, NearbyParams, PlaceParams};
use crate::capabilities::{self, Capabilities};
use crate::departures::{self, Departures, DeparturesParams};
use crate::geo::Point;
use crate::matrix::{self, TravelTimes, TravelTimesParams};
use crate::places::{self, Place, Places, Reverse, SearchParams};
use crate::prompts;
use crate::reachable::{self, Reachable, ReachableParams};
use crate::resources;
use crate::routing::{self, Route, RouteParams};
use crate::stack::Stack;
use crate::transit::{self, Journeys, TransitParams};

const INSTRUCTIONS: &str = "Nav Cat is a self-hosted map, for planning trips with realistic \
travel times. capabilities says what it covers: the area, travel modes, and the public \
transport timetables' modes and dates. Find places with search_places, find_nearby or \
reachable, and their details (such as opening hours) with get_place. plan_route gives routes by \
road or path, plan_transit public transport journeys from the timetables, stop_departures the \
next services from a stop, and travel_times compares times between several places, e.g. to \
order stops. Times are the local time where the trip is, like \"2026-10-24T08:30\". Each place \
has a link that opens it in Nav Cat, to give people.";

#[derive(Clone)]
pub struct NavCat {
    stack: Arc<Stack>,
    tool_router: ToolRouter<Self>,
    prompt_router: PromptRouter<Self>,
}

#[tool_router]
impl NavCat {
    pub fn new(stack: Arc<Stack>) -> Self {
        // Every tool only reads from this stack's own services
        let hints = ToolAnnotations::new()
            .read_only(true)
            .destructive(false)
            .idempotent(true)
            .open_world(false);
        let mut tool_router = Self::tool_router();
        for route in tool_router.map.values_mut() {
            route.attr.annotations = Some(hints.clone());
        }
        NavCat {
            stack,
            tool_router,
            prompt_router: Self::prompt_router(),
        }
    }

    #[tool(
        title = "Search places",
        description = "Find places by name, address or kind (\"museum\", \"cafe\"), giving their \
        coordinates, address details and an id for get_place. Pass `near` to prefer places \
        around a point."
    )]
    async fn search_places(
        &self,
        Parameters(params): Parameters<SearchParams>,
    ) -> Result<Json<Places>, String> {
        Ok(Json(places::search(&self.stack, params).await?))
    }

    #[tool(
        title = "What's here",
        description = "The place or address at a point."
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
        avoid steep hills. Times are for normal speeds, without live traffic."
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
        and times. Timetables only cover some areas and dates (see capabilities)."
    )]
    async fn plan_transit(
        &self,
        Parameters(params): Parameters<TransitParams>,
    ) -> Result<Json<Journeys>, String> {
        Ok(Json(transit::plan(&self.stack, params).await?))
    }

    #[tool(
        title = "Reachable places",
        description = "Places of a category (list_categories) reachable from a point within a \
        travel time by a plan_route mode, e.g. cafes within a 10 minute walk. Up to 30 minutes."
    )]
    async fn reachable(
        &self,
        Parameters(params): Parameters<ReachableParams>,
    ) -> Result<Json<Reachable>, String> {
        Ok(Json(reachable::reachable(&self.stack, params).await?))
    }

    #[tool(
        title = "Next departures",
        description = "The next services from public transport stops, found by name, near a \
        point, or both: each departure's time, route and where it's heading. Each platform or \
        direction is a separate stop, so both directions come back together. Timetabled times \
        unless marked live. Names are as the timetables spell them (often \"St\" for Street); \
        if one isn't found, find the stop with search_places and pass its point as `near`."
    )]
    async fn stop_departures(
        &self,
        Parameters(params): Parameters<DeparturesParams>,
    ) -> Result<Json<Departures>, String> {
        Ok(Json(departures::departures(&self.stack, params).await?))
    }

    #[tool(
        title = "Travel times",
        description = "Travel time (and distance) from each origin to each destination, by a \
        plan_route mode or by public transport, e.g. to choose between places or order stops. \
        Up to 25 pairs, or 9 by public transport."
    )]
    async fn travel_times(
        &self,
        Parameters(params): Parameters<TravelTimesParams>,
    ) -> Result<Json<TravelTimes>, String> {
        Ok(Json(matrix::travel_times(&self.stack, params).await?))
    }

    #[tool(
        title = "Place details",
        description = "Everything known about a place by its id: its OSM tags such as \
        opening_hours, phone, website and address."
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
        public transport: its modes and the dates its timetables run."
    )]
    async fn capabilities(&self) -> Result<Json<Capabilities>, String> {
        Ok(Json(capabilities::capabilities(&self.stack).await?))
    }

    #[tool(
        title = "Place categories",
        description = "The kinds of place find_nearby can look for, e.g. cafes, pharmacies, \
        toilets."
    )]
    async fn list_categories(&self) -> Result<Json<Categories>, String> {
        Ok(Json(browse::categories(&self.stack).await?))
    }

    #[tool(
        title = "Find nearby",
        description = "Places of a category within a distance of a point, nearest first."
    )]
    async fn find_nearby(
        &self,
        Parameters(params): Parameters<NearbyParams>,
    ) -> Result<Json<Nearby>, String> {
        Ok(Json(browse::nearby(&self.stack, params).await?))
    }
}

#[tool_handler(router = self.tool_router)]
#[prompt_handler(router = self.prompt_router)]
impl ServerHandler for NavCat {
    fn get_info(&self) -> ServerConfig {
        let capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .enable_prompts()
            .enable_completions()
            .build();
        ServerConfig::new(capabilities)
            .with_server_info(Implementation::new("navcat", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        Ok(ListResourcesResult::with_all_items(resources::list()))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, ErrorData> {
        Ok(ListResourceTemplatesResult::with_all_items(
            resources::templates(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        Ok(resources::read(&self.stack, &request.uri).await?.into())
    }

    async fn complete(
        &self,
        request: CompleteRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CompleteResult, ErrorData> {
        Ok(prompts::complete(&self.stack, request).await)
    }
}
