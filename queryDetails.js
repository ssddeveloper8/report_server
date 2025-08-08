const selectReports = () => {
  return `
 SELECT 
    r.report_id,
    r.project_id,
    r.report_name,
    r.status,
    r.html_format,
    h.page_name,
    h.tab_name,
    h.sub_tab_name,
    h.page_path,
    s.base_url,
    s.current_project_build_name,
    b.status AS email_status,
    b.email_attachemnet,
    b.email_body,
    b.email_subject,
    STRING_AGG(DISTINCT c.to_list, ';') AS to_list,
    STRING_AGG(DISTINCT c.cc_list, ';') AS cc_list,
    STRING_AGG(DISTINCT c.bcc_list, ';') AS bcc_list,
    STRING_AGG(DISTINCT c.group_name, ';') AS group_names
FROM 
    tbl_mst_reports r
LEFT JOIN 
    public.tbl_mst_report_html h ON r.report_id = h.report_id
LEFT JOIN 
    tbl_project_tomcat_configurations s ON r.project_id = s.current_project_build_id
LEFT JOIN 
    tbl_mst_report_emails b ON r.report_id = b.report_id AND b.status = 'true'
LEFT JOIN
    tbl_mst_report_email_groups g ON b.report_email_id = g.report_email_id
LEFT JOIN
    tbl_mst_report_emails_config c ON g.report_email_config_id = c.report_email_config_id
WHERE 
    r.status = true
GROUP BY
    r.report_id,
    r.project_id,
    r.report_name,
    r.status,
    r.html_format,
    h.page_name,
    h.tab_name,
    h.sub_tab_name,
    h.page_path,
    s.base_url,
    s.current_project_build_name,
    b.status,
    b.email_attachemnet,
    b.email_body,
    b.email_subject
ORDER BY 
    r.report_id ASC;
`;
};

const selectSchedularDetails = () => {
  return `
        select s.pattern, s.report_id,
s.cron_details, s.start_date, s.end_date,s.interval,
d.date, d.day, d.time
from tbl_mst_report_schedular s left join tbl_mst_report_schedular_details d on s.report_schedular_id = d.report_schedular_id
        `;
};

module.exports = { selectReports, selectSchedularDetails };
