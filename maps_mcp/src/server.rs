use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::{ServerHandler, tool_handler, tool_router};

use crate::stack::Stack;

const INSTRUCTIONS: &str = "Nav Cat is a self-hosted map of one region, for planning trips with \
realistic travel times.";

#[derive(Clone)]
pub struct NavCat {
    stack: Arc<Stack>,
    tool_router: ToolRouter<Self>,
}

#[tool_router(allow_empty)]
impl NavCat {
    pub fn new(stack: Arc<Stack>) -> Self {
        NavCat {
            stack,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_handler]
impl ServerHandler for NavCat {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("navcat", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}
