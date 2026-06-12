let barChartInstance = null;
let pieChartInstance = null;

async function initResults() {
    // 1. En son veya aktif olan yarışmayı seç
    const { data: elections, error: elError } = await supabaseClient
        .from("elections")
        .select("id, name, status")
        .order("id", { ascending: false })
        .limit(1);

    if (elError || !elections || elections.length === 0) {
        document.getElementById("currentElectionName").innerText = "Aktif yarışma bulunamadı.";
        return;
    }

    const currentElection = elections[0];
    document.getElementById("currentElectionName").innerText = `${currentElection.name} (${currentElection.status === 'COMPLETED' ? 'Tamamlandı' : 'Canlı/Aktif'})`;

    // 2. Verileri Çek ve Hesapla
    await fetchAndRender(currentElection.id);

    // Eğer oylama aktifse her 10 saniyede bir sonuçları canlı güncelle (Realtime alternatif)
    if (currentElection.status === "ACTIVE") {
        setInterval(() => fetchAndRender(currentElection.id), 10000);
    }
}

async function fetchAndRender(electionId) {
    // Projeleri ve oylarını getir
    const { data: projects, error: prError } = await supabaseClient
        .from("projects")
        .select("id, project_no, project_name, advisor, total_votes")
        .eq("election_id", electionId)
        .order("total_votes", { ascending: false });

    // Kullanılan kod istatistiklerini getir (Katılımcı sayısı için)
    const { data: codes, error: cdError } = await supabaseClient
        .from("voting_codes")
        .select("used")
        .eq("election_id", electionId);

    if (prError || cdError) {
        console.error("Veri yükleme hatası");
        return;
    }

    // --- İSTATİSTİK HESAPLAMALARI ---
    const totalVoters = codes.filter(c => c.used).length;
    const totalVotes = projects.reduce((sum, p) => sum + p.total_votes, 0);
    const avgVotesPerPerson = totalVoters > 0 ? (totalVotes / totalVoters).toFixed(1) : "0.0";

    document.getElementById("statVoters").innerText = totalVoters;
    document.getElementById("statVotes").innerText = totalVotes;
    document.getElementById("statAvg").innerText = avgVotesPerPerson;

    // --- PODYUM VE TABLO ---
    renderPodium(projects);
    renderTable(projects);

    // --- GRAFİKLERİ ÇİZ ---
    renderCharts(projects);
}

function renderPodium(projects) {
    const container = document.getElementById("podiumContainer");
    container.innerHTML = "";
    
    if (projects.length === 0) return;

    // En yüksek oy alan ilk 3 projeyi bul (Aynı oy durumunda project_no'ya göre sıralı gelirler)
    const first = projects[0] || { project_no: '-', total_votes: 0 };
    const second = projects[1] || { project_no: '-', total_votes: 0 };
    const third = projects[2] || { project_no: '-', total_votes: 0 };

    container.innerHTML = `
        <div class="podium-place second-place">
            <div>🥈 2.lik</div>
            <div style="font-size:20px; margin:5px 0;">P. ${second.project_no}</div>
            <div>${second.total_votes} Oy</div>
        </div>
        <div class="podium-place first-place">
            <div>🥇 1.lik</div>
            <div style="font-size:24px; margin:5px 0;">P. ${first.project_no}</div>
            <div>${first.total_votes} Oy</div>
        </div>
        <div class="podium-place third-place">
            <div>🥉 3.lük</div>
            <div style="font-size:18px; margin:5px 0;">P. ${third.project_no}</div>
            <div>${third.total_votes} Oy</div>
        </div>
    `;
}

function renderTable(projects) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";

    projects.forEach((project, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${index + 1}</strong></td>
            <td>Poster ${project.project_no}</td>
            <td>${project.project_name}</td>
            <td>${project.advisor || '-'}</td>
            <td><strong>${project.total_votes}</strong></td>
        `;
        tbody.appendChild(row);
    });
}

function renderCharts(projects) {
    // Grafik için verileri poster numarasına göre sıralayarak hazırlayalım (Grafikte düzenli dursun)
    const sortedByNo = [...projects].sort((a, b) => a.project_no - b.project_no);
    
    const labels = sortedByNo.map(p => `P. ${p.project_no}`);
    const votesData = sortedByNo.map(p => p.total_votes);

    // --- BAR CHART ---
    if (barChartInstance) barChartInstance.destroy();
    const ctxBar = document.getElementById('barChart').getContext('2arrayd'); // Not: getContext('2d')
    barChartInstance = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Alınan Oy Sayısı',
                data: votesData,
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // --- PIE CHART (Sadece oy alan posterlerin oranını gösterir, kalabalığı önler)
    const votedProjects = projects.filter(p => p.total_votes > 0);
    if (pieChartInstance) pieChartInstance.destroy();
    
    pieChartInstance = new Chart(document.getElementById('pieChart'), {
        type: 'pie',
        data: {
            labels: votedProjects.map(p => `Poster ${p.project_no}`),
            datasets: [{
                data: votedProjects.map(p => p.total_votes),
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8bc34a', '#009688'
                ]
            }]
        },
        options: { responsive: true }
    });
}

// Sayfa açıldığında başlat
initResults();